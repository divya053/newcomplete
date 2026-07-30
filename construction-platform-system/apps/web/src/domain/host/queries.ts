import { db, schema } from "@ci/db";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";

/**
 * Host Console read model (Preckon Host backend design, read paths). GLOBAL queries
 * over the control-plane tables — no tenant scoping, because the host plane is
 * platform-wide (spec §0.2). All money in integer minor units. Server components call
 * these directly; mutations live in mutations.ts.
 */

const { orgs, editions, features, editionFeatures, orgSubscriptions, currency, editionPrice, usageRate, coupon, invoice, invoiceLine, notification, hostNotification, hostNotificationRead, platformSetting, aiProvider, emailDomain, jobFailure, auditLog, users, roles, memberships, tenantEntitlementOverride } = schema;

const LIVE_SUB = inArray(orgSubscriptions.status, ["active", "trialing", "past_due"]);

// ── Tenants ───────────────────────────────────────────────────────────────────
export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  region: string;
  edition: string | null;
  editionKey: string | null;
  seats: number | null;
  planMinor: number;
  usageMinor: number;
  currency: string;
  contact: string | null;
  trialEndsAt: Date | null;
  createdAt: Date;
}

export async function listTenants(): Promise<TenantRow[]> {
  const rows = await db
    .select({
      id: orgs.id, name: orgs.name, slug: orgs.slug, status: orgs.status, region: orgs.region,
      contact: orgs.primaryContactEmail, trialEndsAt: orgs.trialEndsAt, createdAt: orgs.createdAt,
      edition: editions.name, editionKey: editions.key,
      seats: orgSubscriptions.seats, planMinor: orgSubscriptions.planAmountMinor,
      usageMinor: orgSubscriptions.usageMtdMinor, currency: orgSubscriptions.currencyCode,
    })
    .from(orgs)
    .leftJoin(orgSubscriptions, and(eq(orgSubscriptions.orgId, orgs.id), LIVE_SUB))
    .leftJoin(editions, eq(editions.id, orgSubscriptions.editionId))
    .where(eq(orgs.isHost, false))
    .orderBy(asc(orgs.name));
  return rows.map((r) => ({
    ...r,
    planMinor: r.planMinor ?? 0,
    usageMinor: r.usageMinor ?? 0,
    currency: r.currency ?? "USD",
  }));
}

export async function getTenant(id: string) {
  const t = (await db.select().from(orgs).where(eq(orgs.id, id)).limit(1))[0];
  if (!t) return null;
  const sub = (await db.select().from(orgSubscriptions).where(and(eq(orgSubscriptions.orgId, id), LIVE_SUB)).orderBy(desc(orgSubscriptions.createdAt)).limit(1))[0];
  const edition = sub ? (await db.select().from(editions).where(eq(editions.id, sub.editionId)).limit(1))[0] : null;
  const memberCount = (await db.select({ n: sql<number>`count(*)` }).from(memberships).where(eq(memberships.orgId, id)))[0]?.n ?? 0;
  const invoices = await db.select().from(invoice).where(eq(invoice.orgId, id)).orderBy(desc(invoice.createdAt)).limit(5);
  const overrides = await db
    .select({ key: features.key, name: features.name, reason: tenantEntitlementOverride.reason, expiresAt: tenantEntitlementOverride.expiresAt })
    .from(tenantEntitlementOverride)
    .innerJoin(features, eq(features.id, tenantEntitlementOverride.featureId))
    .where(eq(tenantEntitlementOverride.orgId, id));
  const recentAudit = await db.select().from(auditLog).where(eq(auditLog.entityId, id)).orderBy(desc(auditLog.createdAt)).limit(6);
  return { tenant: t, sub, edition, memberCount: Number(memberCount), invoices, overrides, recentAudit };
}

// ── Overview / KPIs ───────────────────────────────────────────────────────────
export async function getOverview(hostOrgId: string) {
  const tenantRows = await listTenants();
  const byStatus = (s: string) => tenantRows.filter((t) => t.status === s).length;
  const mrrMinor = tenantRows
    .filter((t) => t.status === "active" || t.status === "past_due")
    .reduce((sum, t) => sum + t.planMinor, 0);
  const usageMinor = tenantRows.reduce((sum, t) => sum + t.usageMinor, 0);
  const trialsEnding = tenantRows.filter((t) => t.status === "trial").length;

  // Active bids across the platform = real preconstruction projects (tender + drawing).
  const tp = (await db.select({ n: sql<number>`count(*)` }).from(schema.tenderProjects))[0]?.n ?? 0;
  const dp = (await db.select({ n: sql<number>`count(*)` }).from(schema.drawingProjects))[0]?.n ?? 0;
  const activeBids = Number(tp) + Number(dp);

  // 6-month revenue: strictly from real invoices (plan vs usage). No backfill — a flat
  // month is a real zero, and if there are no invoices the chart is empty.
  const revRows = await db
    .select({ ym: sql<string>`DATE_FORMAT(${invoice.issuedAt}, '%Y-%m')`, kind: invoiceLine.kind, total: sql<number>`SUM(${invoiceLine.amountMinor})` })
    .from(invoice)
    .innerJoin(invoiceLine, eq(invoiceLine.invoiceId, invoice.id))
    .groupBy(sql`1`, invoiceLine.kind);
  const revenue = trailingMonths(6).map((m) => ({
    month: m.slice(5),
    planMinor: revRows.filter((r) => r.ym === m && r.kind !== "usage").reduce((s, r) => s + Number(r.total), 0),
    usageMinor: revRows.filter((r) => r.ym === m && r.kind === "usage").reduce((s, r) => s + Number(r.total), 0),
  }));
  const hasRevenue = revenue.some((r) => r.planMinor + r.usageMinor > 0);

  const needsAttention = tenantRows
    .filter((t) => t.status === "past_due" || t.status === "trial" || t.status === "suspended")
    .slice(0, 6);

  // Recent HOST actions only (scoped to the host org's audit spine).
  const activity = await db
    .select({ action: auditLog.action, entityType: auditLog.entityType, createdAt: auditLog.createdAt, actor: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(eq(auditLog.orgId, hostOrgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(6);

  const unresolvedFailures = (await db.select({ n: sql<number>`count(*)` }).from(jobFailure).where(eq(jobFailure.resolved, 0)))[0]?.n ?? 0;
  const providerCount = (await db.select({ n: sql<number>`count(*)` }).from(aiProvider).where(eq(aiProvider.status, "active")))[0]?.n ?? 0;

  return {
    kpis: {
      tenants: tenantRows.length,
      active: byStatus("active"),
      trial: byStatus("trial"),
      pastDue: byStatus("past_due"),
      suspended: byStatus("suspended"),
      mrrMinor, usageMinor, trialsEnding, activeBids,
    },
    statusBreakdown: { active: byStatus("active"), trial: byStatus("trial"), pastDue: byStatus("past_due"), suspended: byStatus("suspended") },
    revenue,
    hasRevenue,
    needsAttention,
    activity,
    system: {
      queue: Number(unresolvedFailures) > 2 ? "Degraded" : "Healthy",
      unresolvedFailures: Number(unresolvedFailures),
      providers: Number(providerCount),
    },
  };
}

function trailingMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// ── Catalog: features + editions + matrix ─────────────────────────────────────
export async function listFeaturesFull() {
  const fs = await db.select().from(features).orderBy(asc(features.sortOrder), asc(features.name));
  const map = await db.select({ editionId: editionFeatures.editionId, featureId: editionFeatures.featureId, enabled: editionFeatures.enabled }).from(editionFeatures);
  const eds = await db.select({ id: editions.id, key: editions.key }).from(editions).where(eq(editions.status, "published")).orderBy(asc(editions.sortOrder));
  return fs.map((f) => ({
    ...f,
    editions: eds.map((e) => ({ key: e.key, included: map.some((m) => m.editionId === e.id && m.featureId === f.id && m.enabled) })),
  }));
}

export interface HostEdition {
  id: string; name: string; key: string | null; description: string | null; status: string; isPublic: boolean; trialDays: number; sortOrder: number;
  moduleCount: number; seatCap: number | null; tenantCount: number;
}

export async function listHostEditions(): Promise<HostEdition[]> {
  const eds = await db.select().from(editions).orderBy(asc(editions.sortOrder), asc(editions.name));
  const efs = await db
    .select({ editionId: editionFeatures.editionId, category: features.category, key: features.key, enabled: editionFeatures.enabled, limitValue: editionFeatures.limitValue })
    .from(editionFeatures)
    .innerJoin(features, eq(features.id, editionFeatures.featureId));
  const counts = await db
    .select({ editionId: orgSubscriptions.editionId, n: sql<number>`count(*)` })
    .from(orgSubscriptions)
    .innerJoin(orgs, and(eq(orgs.id, orgSubscriptions.orgId), eq(orgs.isHost, false)))
    .where(LIVE_SUB)
    .groupBy(orgSubscriptions.editionId);
  return eds.map((e) => {
    const mine = efs.filter((x) => x.editionId === e.id);
    const seat = mine.find((x) => x.key === "limit.seats" && x.enabled);
    return {
      id: e.id, name: e.name, key: e.key, description: e.description, status: e.status, isPublic: e.isPublic, trialDays: e.trialDays, sortOrder: e.sortOrder,
      moduleCount: mine.filter((x) => x.category === "module" && x.enabled).length,
      seatCap: seat ? (seat.limitValue == null ? null : Number(seat.limitValue)) : 0,
      tenantCount: Number(counts.find((c) => c.editionId === e.id)?.n ?? 0),
    };
  });
}

/** Feature × published-edition matrix (spec §4.4 GET /editions/matrix). */
export async function getEditionMatrix() {
  const eds = await db.select({ id: editions.id, key: editions.key, name: editions.name }).from(editions).where(eq(editions.status, "published")).orderBy(asc(editions.sortOrder));
  const fs = await db.select().from(features).where(ne(features.status, "deprecated")).orderBy(asc(features.sortOrder));
  const cells = await db.select().from(editionFeatures);
  const categories = ["module", "capability", "limit", "usage"];
  const groups = categories.map((cat) => ({
    category: cat,
    features: fs.filter((f) => f.category === cat).map((f) => ({
      key: f.key, name: f.name, type: f.type, unit: f.unit,
      cells: eds.map((e) => {
        const cell = cells.find((c) => c.editionId === e.id && c.featureId === f.id);
        return {
          editionId: e.id,
          enabled: !!cell?.enabled,
          limitValue: cell?.limitValue == null ? null : Number(cell.limitValue),
          enumValue: cell?.enumValue ?? null,
        };
      }),
    })),
  })).filter((g) => g.features.length > 0);
  return { editions: eds, groups };
}

// ── Pricing ───────────────────────────────────────────────────────────────────
export async function getPricing(cur = "USD") {
  const eds = await db.select().from(editions).orderBy(asc(editions.sortOrder), asc(editions.name));
  // Explicit per-currency plan prices, if any host has set them.
  const prices = await db.select().from(editionPrice).where(eq(editionPrice.currencyCode, cur));
  // Real per-feature monthly prices — an edition's plan price is the sum of the
  // monthly prices of the features it bundles (the platform's real pricing model).
  const featPrice = await db
    .select({ editionId: editionFeatures.editionId, price: features.monthlyPrice, enabled: editionFeatures.enabled })
    .from(editionFeatures)
    .innerJoin(features, eq(features.id, editionFeatures.featureId));
  const rates = await db
    .select({ key: features.key, name: features.name, unit: features.unit, amountMinor: usageRate.amountMinor })
    .from(usageRate)
    .innerJoin(features, eq(features.id, usageRate.featureId))
    .where(eq(usageRate.currencyCode, cur))
    .orderBy(asc(features.sortOrder));
  const coupons = await db.select().from(coupon).orderBy(desc(coupon.createdAt));
  const currencies = await db.select().from(currency).where(eq(currency.isActive, 1)).orderBy(asc(currency.sortOrder));
  const tenantCounts = await db
    .select({ editionId: orgSubscriptions.editionId, n: sql<number>`count(*)` })
    .from(orgSubscriptions)
    .innerJoin(orgs, and(eq(orgs.id, orgSubscriptions.orgId), eq(orgs.isHost, false)))
    .where(LIVE_SUB)
    .groupBy(orgSubscriptions.editionId);
  return {
    currency: cur,
    currencies,
    editions: eds.map((e) => {
      const explicit = prices.find((p) => p.editionId === e.id && p.interval === "monthly")?.amountMinor ?? null;
      const derivedMinor = Math.round(featPrice.filter((f) => f.editionId === e.id && f.enabled).reduce((s, f) => s + Number(f.price), 0) * 100);
      return {
        id: e.id, name: e.name, key: e.key, isPublic: e.isPublic,
        monthly: explicit ?? (derivedMinor > 0 ? derivedMinor : null),
        derived: explicit === null && derivedMinor > 0,
        annual: prices.find((p) => p.editionId === e.id && p.interval === "annual")?.amountMinor ?? null,
        seatCap: null as number | null,
        tenantCount: Number(tenantCounts.find((c) => c.editionId === e.id)?.n ?? 0),
      };
    }),
    rates,
    coupons,
  };
}

// ── Billing: subscriptions, invoices, summary ─────────────────────────────────
export async function listSubscriptions() {
  return db
    .select({
      orgId: orgs.id, tenant: orgs.name, status: orgSubscriptions.status, seats: orgSubscriptions.seats,
      planMinor: orgSubscriptions.planAmountMinor, usageMinor: orgSubscriptions.usageMtdMinor, currency: orgSubscriptions.currencyCode,
      interval: orgSubscriptions.interval, edition: editions.name, renews: orgSubscriptions.currentPeriodEnd,
    })
    .from(orgSubscriptions)
    .innerJoin(orgs, eq(orgs.id, orgSubscriptions.orgId))
    .innerJoin(editions, eq(editions.id, orgSubscriptions.editionId))
    .where(LIVE_SUB)
    .orderBy(desc(orgSubscriptions.planAmountMinor));
}

export async function listInvoices(limit = 25) {
  return db
    .select({ id: invoice.id, number: invoice.number, tenant: orgs.name, currency: invoice.currencyCode, status: invoice.status, total: invoice.totalMinor, issuedAt: invoice.issuedAt, dueDate: invoice.dueDate })
    .from(invoice)
    .innerJoin(orgs, eq(orgs.id, invoice.orgId))
    .orderBy(desc(invoice.createdAt))
    .limit(limit);
}

export async function getBillingSummary() {
  const subs = await listSubscriptions();
  const mrrMinor = subs.filter((s) => s.status === "active" || s.status === "past_due").reduce((sum, s) => sum + (s.interval === "annual" ? Math.round(s.planMinor / 12) : s.planMinor), 0);
  const usageMinor = subs.reduce((sum, s) => sum + s.usageMinor, 0);
  const invs = await listInvoices(200);
  const outstandingMinor = invs.filter((i) => i.status === "open" || i.status === "uncollectible").reduce((s, i) => s + i.total, 0);
  const collectedMinor = invs.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);
  return {
    mrrMinor, arrMinor: mrrMinor * 12, usageMinor, outstandingMinor, collectedMinor,
    failedPayments: invs.filter((i) => i.status === "open" || i.status === "uncollectible").length,
    upcomingRenewals: subs.filter((s) => s.renews && s.renews.getTime() < Date.now() + 30 * 864e5).length,
    trialsEnding: subs.filter((s) => s.status === "trialing").length,
    counts: {
      trialing: subs.filter((s) => s.status === "trialing").length,
      active: subs.filter((s) => s.status === "active").length,
      pastDue: subs.filter((s) => s.status === "past_due").length,
    },
  };
}

// ── Notifications ─────────────────────────────────────────────────────────────
export async function listBroadcasts() {
  return db.select().from(notification).orderBy(desc(notification.createdAt));
}
export async function listHostInbox(userId: string) {
  const items = await db.select().from(hostNotification).orderBy(desc(hostNotification.createdAt)).limit(30);
  const reads = await db.select({ id: hostNotificationRead.hostNotificationId }).from(hostNotificationRead).where(eq(hostNotificationRead.hostUserId, userId));
  const readSet = new Set(reads.map((r) => r.id));
  return items.map((i) => ({ ...i, read: readSet.has(i.id) }));
}
export async function getUnreadCount(userId: string) {
  const items = await listHostInbox(userId);
  return items.filter((i) => !i.read).length;
}

// ── Host users & roles ────────────────────────────────────────────────────────
export async function listHostUsers(hostOrgId: string) {
  return db
    .select({ userId: users.id, name: users.name, email: users.email, role: roles.name, joinedAt: memberships.createdAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(eq(memberships.orgId, hostOrgId))
    .orderBy(asc(users.name));
}
export async function listHostRoles(hostOrgId: string) {
  const rs = await db.select().from(roles).where(eq(roles.orgId, hostOrgId)).orderBy(asc(roles.name));
  const counts = await db.select({ roleId: memberships.roleId, n: sql<number>`count(*)` }).from(memberships).where(eq(memberships.orgId, hostOrgId)).groupBy(memberships.roleId);
  return rs.map((r) => ({ ...r, userCount: Number(counts.find((c) => c.roleId === r.id)?.n ?? 0) }));
}

// ── Settings ──────────────────────────────────────────────────────────────────
export async function getSettings() {
  const kv = await db.select().from(platformSetting);
  const providers = await db.select().from(aiProvider).orderBy(asc(aiProvider.createdAt));
  const domains = await db.select().from(emailDomain);
  const map: Record<string, unknown> = {};
  for (const s of kv) map[s.key] = s.value;
  return { settings: map, providers, domains };
}

// ── Observability ─────────────────────────────────────────────────────────────
export async function getObservability() {
  const failed = await db
    .select({ id: jobFailure.id, jobType: jobFailure.jobType, errorClass: jobFailure.errorClass, errorMessage: jobFailure.errorMessage, failedAt: jobFailure.failedAt, resolved: jobFailure.resolved, org: orgs.name })
    .from(jobFailure)
    .leftJoin(orgs, eq(orgs.id, jobFailure.orgId))
    .orderBy(desc(jobFailure.failedAt))
    .limit(25);
  const unresolved = failed.filter((f) => !f.resolved).length;
  const providers = await db.select().from(aiProvider).where(eq(aiProvider.status, "active"));
  // Queue depth / throughput / latency are a live read-through over arq+Redis and
  // Langfuse (spec §10.1). That facade is not wired in this deployment, so we report
  // it as NOT CONNECTED rather than inventing numbers. The one owned, real signal is
  // the durable failed-job table below.
  return {
    failed,
    queueConnected: false,
    providers: providers.map((p) => ({ name: p.name, role: p.role, kind: p.kind })),
    unresolved,
    totalFailures: failed.length,
  };
}

// ── Host audit ────────────────────────────────────────────────────────────────
export async function listHostAudit(hostOrgId: string, limit = 60) {
  return db
    .select({ id: auditLog.id, action: auditLog.action, entityType: auditLog.entityType, entityId: auditLog.entityId, createdAt: auditLog.createdAt, actor: users.name, actorEmail: users.email, before: auditLog.before, after: auditLog.after })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(eq(auditLog.orgId, hostOrgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
