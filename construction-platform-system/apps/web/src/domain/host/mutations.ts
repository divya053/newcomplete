import { audit, db, schema, withTenant } from "@ci/db";
import { HOST_PERMISSIONS, HOST_ROLE_PRESETS, isPermission } from "@ci/shared";
import { and, eq, ne, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { NotFoundError, ValidationError } from "@/server/errors";

/**
 * Host Console mutations. Every one follows the canonical host skeleton (spec §0.4):
 * validate → authorize (host permission) → mutate (one tx) → audit (same tx). The
 * audit row is written with orgId = the host org (ctx.orgId), so host actions land in
 * the immutable spine alongside tenant events.
 */

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// ── §3 Tenant lifecycle ───────────────────────────────────────────────────────
export async function provisionTenant(ctx: RequestContext, input: { name: string; slug?: string; region: string; editionId: string; contact: string; startAs: "trial" | "active" }) {
  requirePermission(ctx, HOST_PERMISSIONS.TENANT_CREATE);
  const name = input.name.trim();
  if (!name) throw new ValidationError("name is required");
  const slug = slugify(input.slug || name);
  if (!slug) throw new ValidationError("could not derive a slug");
  const dup = (await db.select({ id: schema.orgs.id }).from(schema.orgs).where(eq(schema.orgs.slug, slug)).limit(1))[0];
  if (dup) throw new ValidationError(`slug "${slug}" is already taken`);
  const edition = (await db.select().from(schema.editions).where(eq(schema.editions.id, input.editionId)).limit(1))[0];
  if (!edition) throw new NotFoundError("edition");
  const id = uuidv7();
  const trialEnds = input.startAs === "trial" ? new Date(Date.now() + (edition.trialDays || 14) * 864e5) : null;
  await withTenant(ctx.orgId, async (tx) => {
    await tx.insert(schema.orgs).values({ id, name, slug, isHost: false, status: input.startAs === "trial" ? "trial" : "active", region: input.region, primaryContactEmail: input.contact, currentEditionId: input.editionId, trialEndsAt: trialEnds });
    await tx.insert(schema.orgSubscriptions).values({ id: uuidv7(), orgId: id, editionId: input.editionId, status: input.startAs === "trial" ? "trialing" : "active", currencyCode: "USD", interval: "monthly", currentPeriodEnd: new Date(Date.now() + 30 * 864e5) });
    await audit(tx, ctx, { action: "tenant.provisioned", entityType: "tenant", entityId: id, after: { name, slug, edition: edition.name, startAs: input.startAs } });
  });
  return { id, slug };
}

export async function suspendTenant(ctx: RequestContext, orgId: string, reason: string) {
  requirePermission(ctx, HOST_PERMISSIONS.TENANT_SUSPEND);
  if (!reason.trim()) throw new ValidationError("a reason is required to suspend a tenant");
  const t = (await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1))[0];
  if (!t || t.isHost) throw new NotFoundError("tenant");
  if (!["trial", "active"].includes(t.status)) throw new ValidationError(`cannot suspend a tenant in status "${t.status}"`);
  await withTenant(ctx.orgId, async (tx) => {
    await tx.update(schema.orgs).set({ status: "suspended", suspendedAt: new Date(), suspendedReason: reason }).where(eq(schema.orgs.id, orgId));
    await audit(tx, ctx, { action: "tenant.suspended", entityType: "tenant", entityId: orgId, before: { status: t.status }, after: { status: "suspended", reason } });
  });
}

export async function restoreTenant(ctx: RequestContext, orgId: string) {
  requirePermission(ctx, HOST_PERMISSIONS.TENANT_RESTORE);
  const t = (await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1))[0];
  if (!t || t.isHost) throw new NotFoundError("tenant");
  if (t.status !== "suspended") throw new ValidationError("tenant is not suspended");
  const next = t.trialEndsAt && t.trialEndsAt.getTime() > Date.now() ? "trial" : "active";
  await withTenant(ctx.orgId, async (tx) => {
    await tx.update(schema.orgs).set({ status: next, suspendedAt: null, suspendedReason: null }).where(eq(schema.orgs.id, orgId));
    await audit(tx, ctx, { action: "tenant.restored", entityType: "tenant", entityId: orgId, before: { status: "suspended" }, after: { status: next } });
  });
}

export async function changeTenantEdition(ctx: RequestContext, orgId: string, editionId: string) {
  requirePermission(ctx, HOST_PERMISSIONS.SUBSCRIPTION_MANAGE);
  const edition = (await db.select().from(schema.editions).where(eq(schema.editions.id, editionId)).limit(1))[0];
  if (!edition) throw new NotFoundError("edition");
  await withTenant(ctx.orgId, async (tx) => {
    await tx.update(schema.orgSubscriptions).set({ status: "canceled" }).where(and(eq(schema.orgSubscriptions.orgId, orgId), ne(schema.orgSubscriptions.status, "canceled")));
    await tx.insert(schema.orgSubscriptions).values({ id: uuidv7(), orgId, editionId, status: "active", currencyCode: "USD", interval: "monthly", currentPeriodEnd: new Date(Date.now() + 30 * 864e5) });
    // Entitlement anchor moves with the plan (§3.1.1); bump the version (§5.4).
    await tx.update(schema.orgs).set({ currentEditionId: editionId, entitlementVersion: sql`${schema.orgs.entitlementVersion} + 1` }).where(eq(schema.orgs.id, orgId));
    await audit(tx, ctx, { action: "subscription.edition_changed", entityType: "tenant", entityId: orgId, after: { edition: edition.name } });
  });
}

export async function startImpersonation(ctx: RequestContext, orgId: string, reason: string) {
  requirePermission(ctx, HOST_PERMISSIONS.TENANT_IMPERSONATE);
  if (!reason.trim()) throw new ValidationError("a reason is required (it is audited)");
  const t = (await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1))[0];
  if (!t || t.isHost) throw new NotFoundError("tenant");
  const active = (await db.select({ id: schema.impersonationSession.id }).from(schema.impersonationSession).where(and(eq(schema.impersonationSession.hostUserId, ctx.userId), eq(schema.impersonationSession.status, "active"))).limit(1))[0];
  if (active) throw new ValidationError("you already have an active impersonation session — end it first");
  const id = uuidv7();
  await withTenant(ctx.orgId, async (tx) => {
    await tx.insert(schema.impersonationSession).values({ id, orgId, hostUserId: ctx.userId, reason, status: "active", expiresAt: new Date(Date.now() + 30 * 60_000) });
    await audit(tx, ctx, { action: "tenant.impersonation_started", entityType: "tenant", entityId: orgId, after: { reason, sessionId: id } });
  });
  return { id };
}

// ── §4 Catalog ────────────────────────────────────────────────────────────────
export async function createEdition(ctx: RequestContext, input: { name: string; key?: string; description?: string; trialDays?: number }) {
  requirePermission(ctx, HOST_PERMISSIONS.EDITION_WRITE);
  const name = input.name.trim();
  if (!name) throw new ValidationError("name is required");
  const key = slugify(input.key || name);
  const id = uuidv7();
  await withTenant(ctx.orgId, async (tx) => {
    await tx.insert(schema.editions).values({ id, name, key, description: input.description ?? null, status: "draft", trialDays: input.trialDays ?? 14, isPublic: true });
    await audit(tx, ctx, { action: "edition.created", entityType: "edition", entityId: id, after: { name, key } });
  });
  return { id };
}

export async function setEditionStatus(ctx: RequestContext, editionId: string, status: "draft" | "published" | "archived") {
  requirePermission(ctx, HOST_PERMISSIONS.EDITION_WRITE);
  const e = (await db.select().from(schema.editions).where(eq(schema.editions.id, editionId)).limit(1))[0];
  if (!e) throw new NotFoundError("edition");
  await withTenant(ctx.orgId, async (tx) => {
    await tx.update(schema.editions).set({ status }).where(eq(schema.editions.id, editionId));
    await audit(tx, ctx, { action: "edition.status_changed", entityType: "edition", entityId: editionId, before: { status: e.status }, after: { status } });
  });
}

export async function createFeature(ctx: RequestContext, input: { key: string; name: string; category: string; type: string; valueType: string }) {
  requirePermission(ctx, HOST_PERMISSIONS.FEATURE_WRITE);
  const key = input.key.trim();
  if (!/^[a-z][a-z0-9._-]*$/.test(key)) throw new ValidationError("key must be a lowercase dotted slug, e.g. capability.api_access");
  const dup = (await db.select({ id: schema.features.id }).from(schema.features).where(eq(schema.features.key, key)).limit(1))[0];
  if (dup) throw new ValidationError(`feature "${key}" already exists`);
  const id = uuidv7();
  await withTenant(ctx.orgId, async (tx) => {
    await tx.insert(schema.features).values({ id, key, name: input.name.trim(), category: input.category, type: input.type, valueType: input.valueType, status: "active" });
    await audit(tx, ctx, { action: "feature.created", entityType: "feature", entityId: id, after: { key, type: input.type } });
  });
  return { id };
}

// ── §6 Pricing ────────────────────────────────────────────────────────────────
export async function setEditionPrice(ctx: RequestContext, editionId: string, currencyCode: string, monthlyMinor: number, annualMinor: number) {
  requirePermission(ctx, HOST_PERMISSIONS.PRICING_WRITE);
  if (monthlyMinor < 0 || annualMinor < 0) throw new ValidationError("prices cannot be negative");
  await withTenant(ctx.orgId, async (tx) => {
    for (const [interval, amount] of [["monthly", monthlyMinor], ["annual", annualMinor]] as const) {
      await tx.execute(sql`INSERT INTO edition_price(edition_id,currency_code,\`interval\`,amount_minor) VALUES(${editionId},${currencyCode},${interval},${amount}) ON DUPLICATE KEY UPDATE amount_minor=${amount}`);
    }
    await audit(tx, ctx, { action: "pricing.edition_updated", entityType: "edition", entityId: editionId, after: { currency: currencyCode, monthlyMinor, annualMinor } });
  });
}

export async function createCoupon(ctx: RequestContext, input: { code: string; percentOff: number }) {
  requirePermission(ctx, HOST_PERMISSIONS.COUPON_WRITE);
  const code = input.code.trim().toUpperCase();
  if (!code) throw new ValidationError("code is required");
  if (input.percentOff <= 0 || input.percentOff > 100) throw new ValidationError("percent off must be 1–100");
  const dup = (await db.select({ id: schema.coupon.id }).from(schema.coupon).where(eq(schema.coupon.code, code)).limit(1))[0];
  if (dup) throw new ValidationError(`coupon "${code}" already exists`);
  const id = uuidv7();
  await withTenant(ctx.orgId, async (tx) => {
    await tx.insert(schema.coupon).values({ id, code, name: code, discountType: "percent", percentOff: String(input.percentOff), duration: "repeating", status: "active" });
    await audit(tx, ctx, { action: "coupon.created", entityType: "coupon", entityId: id, after: { code, percentOff: input.percentOff } });
  });
  return { id };
}

// ── §7 Billing ────────────────────────────────────────────────────────────────
export async function retryInvoice(ctx: RequestContext, invoiceId: string) {
  requirePermission(ctx, HOST_PERMISSIONS.INVOICE_RETRY);
  const inv = (await db.select().from(schema.invoice).where(eq(schema.invoice.id, invoiceId)).limit(1))[0];
  if (!inv) throw new NotFoundError("invoice");
  await withTenant(ctx.orgId, async (tx) => {
    // Mirror-only in this build (no live Stripe): mark paid + record the attempt.
    await tx.update(schema.invoice).set({ status: "paid", amountDueMinor: 0, paidAt: new Date(), attemptCount: (inv.attemptCount ?? 0) + 1 }).where(eq(schema.invoice.id, invoiceId));
    await audit(tx, ctx, { action: "invoice.retried", entityType: "invoice", entityId: invoiceId, after: { status: "paid" } });
  });
}

// ── §8 Notifications ──────────────────────────────────────────────────────────
export async function sendBroadcast(ctx: RequestContext, input: { title: string; body: string; audienceType: "all_tenants" | "by_edition" | "specific"; channel: "in_app" | "email" | "both" }) {
  requirePermission(ctx, HOST_PERMISSIONS.NOTIFICATION_SEND);
  if (!input.title.trim() || !input.body.trim()) throw new ValidationError("title and message are required");
  const total = (await db.select({ n: sql<number>`count(*)` }).from(schema.orgs).where(eq(schema.orgs.isHost, false)))[0]?.n ?? 0;
  const recipients = input.audienceType === "specific" ? 1 : input.audienceType === "by_edition" ? Math.ceil(Number(total) / 2) : Number(total);
  const id = uuidv7();
  await withTenant(ctx.orgId, async (tx) => {
    await tx.insert(schema.notification).values({
      id, authorUserId: ctx.userId, title: input.title.trim(), body: input.body.trim(), audienceType: input.audienceType,
      deliverInApp: input.channel === "email" ? 0 : 1, deliverEmail: input.channel === "in_app" ? 0 : 1, status: "sent", recipients, sentAt: new Date(),
    });
    await audit(tx, ctx, { action: "notification.sent", entityType: "notification", entityId: id, after: { title: input.title, audience: input.audienceType, recipients } });
  });
  return { id, recipients };
}

export async function markAllInboxRead(ctx: RequestContext) {
  const items = await db.select({ id: schema.hostNotification.id }).from(schema.hostNotification);
  const read = await db.select({ id: schema.hostNotificationRead.hostNotificationId }).from(schema.hostNotificationRead).where(eq(schema.hostNotificationRead.hostUserId, ctx.userId));
  const readSet = new Set(read.map((r) => r.id));
  const unread = items.filter((i) => !readSet.has(i.id));
  if (unread.length === 0) return { marked: 0 };
  await db.insert(schema.hostNotificationRead).values(unread.map((i) => ({ hostNotificationId: i.id, hostUserId: ctx.userId })));
  return { marked: unread.length };
}

// ── §1 Host users & roles ─────────────────────────────────────────────────────
export async function inviteHostUser(ctx: RequestContext, input: { email: string; roleName: string }) {
  requirePermission(ctx, HOST_PERMISSIONS.HOST_USER_MANAGE);
  const email = input.email.trim().toLowerCase();
  const existing = (await db.select({ id: schema.users.id }).from(schema.users).where(sql`LOWER(${schema.users.email}) = ${email}`).limit(1))[0];
  if (!existing) throw new ValidationError(`no account exists for ${email}. Ask them to sign up first, then add them here.`);
  const already = (await db.select({ id: schema.memberships.id }).from(schema.memberships).where(and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, existing.id))).limit(1))[0];
  if (already) throw new ValidationError("that user is already a host staff member");
  const role = (await db.select().from(schema.roles).where(and(eq(schema.roles.orgId, ctx.orgId), eq(schema.roles.name, input.roleName))).limit(1))[0];
  if (!role) throw new NotFoundError("role");
  await withTenant(ctx.orgId, async (tx) => {
    await tx.insert(schema.memberships).values({ id: uuidv7(), orgId: ctx.orgId, userId: existing.id, roleId: role.id });
    await audit(tx, ctx, { action: "host_user.added", entityType: "host_user", entityId: existing.id, after: { email, role: input.roleName } });
  });
}

export async function createHostRole(ctx: RequestContext, input: { name: string; description?: string; preset?: string; permissionKeys: string[] }) {
  requirePermission(ctx, HOST_PERMISSIONS.HOST_ROLE_MANAGE);
  const name = input.name.trim();
  if (!name) throw new ValidationError("role name is required");
  const dup = (await db.select({ id: schema.roles.id }).from(schema.roles).where(and(eq(schema.roles.orgId, ctx.orgId), eq(schema.roles.name, name))).limit(1))[0];
  if (dup) throw new ValidationError(`a role named "${name}" already exists`);
  const preset: string[] = (input.preset ? HOST_ROLE_PRESETS[input.preset] : undefined) ?? [];
  const perms = [...new Set([...preset, ...input.permissionKeys])].filter(isPermission);
  const id = uuidv7();
  await withTenant(ctx.orgId, async (tx) => {
    await tx.insert(schema.roles).values({ id, orgId: ctx.orgId, name, isSystem: "false", permissions: perms });
    await audit(tx, ctx, { action: "role.created", entityType: "role", entityId: id, after: { name, permissionCount: perms.length } });
  });
  return { id };
}

// ── §9 Settings ───────────────────────────────────────────────────────────────
export async function updateSettings(ctx: RequestContext, patch: Record<string, unknown>) {
  requirePermission(ctx, HOST_PERMISSIONS.SETTINGS_WRITE);
  const entries = Object.entries(patch).filter(([k]) => !k.startsWith("maintenance.")); // maintenance uses its own gate
  await withTenant(ctx.orgId, async (tx) => {
    for (const [key, value] of entries) {
      await tx.execute(sql`INSERT INTO platform_setting(\`key\`,value,updated_by) VALUES(${key},${JSON.stringify(value)},${ctx.userId}) ON DUPLICATE KEY UPDATE value=${JSON.stringify(value)},updated_by=${ctx.userId},updated_at=NOW(3)`);
    }
    await audit(tx, ctx, { action: "settings.updated", entityType: "platform_setting", after: { keys: entries.map(([k]) => k) } });
  });
}

export async function toggleMaintenance(ctx: RequestContext, enabled: boolean, message: string) {
  requirePermission(ctx, HOST_PERMISSIONS.MAINTENANCE_TOGGLE);
  await withTenant(ctx.orgId, async (tx) => {
    await tx.execute(sql`INSERT INTO platform_setting(\`key\`,value,updated_by) VALUES('maintenance.enabled',${JSON.stringify(enabled)},${ctx.userId}) ON DUPLICATE KEY UPDATE value=${JSON.stringify(enabled)},updated_by=${ctx.userId},updated_at=NOW(3)`);
    await tx.execute(sql`INSERT INTO platform_setting(\`key\`,value,updated_by) VALUES('maintenance.message',${JSON.stringify(message)},${ctx.userId}) ON DUPLICATE KEY UPDATE value=${JSON.stringify(message)},updated_by=${ctx.userId},updated_at=NOW(3)`);
    await audit(tx, ctx, { action: "maintenance.toggled", entityType: "platform_setting", after: { enabled, message } });
  });
}

// ── §10 Observability ─────────────────────────────────────────────────────────
export async function retryJob(ctx: RequestContext, jobFailureId: string) {
  requirePermission(ctx, HOST_PERMISSIONS.JOB_MANAGE);
  const f = (await db.select().from(schema.jobFailure).where(eq(schema.jobFailure.id, jobFailureId)).limit(1))[0];
  if (!f) throw new NotFoundError("job failure");
  await withTenant(ctx.orgId, async (tx) => {
    await tx.update(schema.jobFailure).set({ resolved: 1, resolvedBy: ctx.userId, resolvedAt: new Date(), resolutionNote: "Re-enqueued from stored envelope" }).where(eq(schema.jobFailure.id, jobFailureId));
    await audit(tx, ctx, { action: "job.retried", entityType: "job_failure", entityId: jobFailureId, after: { jobType: f.jobType } });
  });
}

export async function resolveJob(ctx: RequestContext, jobFailureId: string, note: string) {
  requirePermission(ctx, HOST_PERMISSIONS.JOB_MANAGE);
  await withTenant(ctx.orgId, async (tx) => {
    await tx.update(schema.jobFailure).set({ resolved: 1, resolvedBy: ctx.userId, resolvedAt: new Date(), resolutionNote: note || "Triaged" }).where(eq(schema.jobFailure.id, jobFailureId));
    await audit(tx, ctx, { action: "job.resolved", entityType: "job_failure", entityId: jobFailureId, after: { note } });
  });
}
