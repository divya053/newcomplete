import { randomUUID } from "node:crypto";
import { audit, db, schema, withTenant } from "@ci/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { requireHost } from "@/server/authz";
import type { RequestContext } from "@/server/context";

export interface EditionView {
  id: string;
  name: string;
  description: string | null;
  features: { key: string; name: string; price: number }[];
  price: number;
}

/** All features (host catalogue). */
export async function listFeatures() {
  return db.select().from(schema.features).orderBy(asc(schema.features.name));
}

/** Editions with their features + computed monthly price. (Read — used by host + tenant.) */
export async function listEditions(): Promise<EditionView[]> {
  const eds = await db.select().from(schema.editions).where(eq(schema.editions.active, true)).orderBy(asc(schema.editions.name));
  const map = await db
    .select({ editionId: schema.editionFeatures.editionId, key: schema.features.key, name: schema.features.name, price: schema.features.monthlyPrice })
    .from(schema.editionFeatures)
    .innerJoin(schema.features, eq(schema.features.id, schema.editionFeatures.featureId));
  return eds.map((e) => {
    const feats = map.filter((m) => m.editionId === e.id).map((f) => ({ key: f.key, name: f.name, price: Number(f.price) }));
    return { id: e.id, name: e.name, description: e.description, features: feats, price: feats.reduce((s, f) => s + f.price, 0) };
  });
}

/** Every tenant org + its current edition (host, cross-tenant view). */
export async function listTenants(ctx: RequestContext) {
  requireHost(ctx);
  const orgs = await db.select({ id: schema.orgs.id, name: schema.orgs.name }).from(schema.orgs).where(eq(schema.orgs.isHost, false)).orderBy(asc(schema.orgs.slug));
  const subs = await db
    .select({ orgId: schema.orgSubscriptions.orgId, editionName: schema.editions.name, editionId: schema.editions.id })
    .from(schema.orgSubscriptions)
    .innerJoin(schema.editions, eq(schema.editions.id, schema.orgSubscriptions.editionId))
    .where(eq(schema.orgSubscriptions.status, "active"))
    .orderBy(desc(schema.orgSubscriptions.createdAt));
  const current = new Map<string, { editionName: string; editionId: string }>();
  for (const s of subs) if (!current.has(s.orgId)) current.set(s.orgId, { editionName: s.editionName, editionId: s.editionId });
  return orgs.map((o) => ({ id: o.id, name: o.name, edition: current.get(o.id)?.editionName ?? "—", editionId: current.get(o.id)?.editionId ?? null }));
}

/** Host — create a new edition from selected features. */
export async function createEdition(ctx: RequestContext, input: { name: string; description?: string; featureIds: string[] }) {
  requireHost(ctx);
  const id = randomUUID();
  await withTenant(ctx.orgId, async (tx) => {
    await tx.insert(schema.editions).values({ id, name: input.name, description: input.description ?? null });
    for (const fid of input.featureIds) await tx.insert(schema.editionFeatures).values({ editionId: id, featureId: fid });
    await audit(tx, ctx, { action: "platform.edition.created", entityType: "edition", entityId: id, after: { name: input.name, features: input.featureIds.length } });
  });
  return { id };
}

/** Host — set a tenant's edition (supersede their active subscription). */
export async function setTenantEdition(ctx: RequestContext, orgId: string, editionId: string) {
  requireHost(ctx);
  await withTenant(ctx.orgId, async (tx) => {
    await tx.update(schema.orgSubscriptions).set({ status: "cancelled" }).where(and(eq(schema.orgSubscriptions.orgId, orgId), eq(schema.orgSubscriptions.status, "active")));
    await tx.insert(schema.orgSubscriptions).values({ id: randomUUID(), orgId, editionId, status: "active" });
    await audit(tx, ctx, { action: "platform.tenant.edition_set", entityType: "org", entityId: orgId, after: { editionId } });
  });
}
