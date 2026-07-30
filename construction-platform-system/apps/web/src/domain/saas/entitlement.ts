import { db, schema } from "@ci/db";
import { and, desc, eq } from "drizzle-orm";
import type { RequestContext } from "@/server/context";

/**
 * The active org's feature entitlement = the feature keys included in its current
 * edition. The host org gets ALL active features. This set gates which modules the
 * tenant can use (boq, boq_ai, drawing, narrative, …).
 */
export async function getOrgFeatures(ctx: RequestContext): Promise<Set<string>> {
  if (ctx.isHost) {
    const rows = await db.select({ key: schema.features.key }).from(schema.features).where(eq(schema.features.active, true));
    return new Set(rows.map((r) => r.key));
  }
  const sub = (
    await db
      .select({ editionId: schema.orgSubscriptions.editionId })
      .from(schema.orgSubscriptions)
      .where(and(eq(schema.orgSubscriptions.orgId, ctx.orgId), eq(schema.orgSubscriptions.status, "active")))
      .orderBy(desc(schema.orgSubscriptions.createdAt))
      .limit(1)
  )[0];
  if (!sub) return new Set();
  const rows = await db
    .select({ key: schema.features.key })
    .from(schema.editionFeatures)
    .innerJoin(schema.features, eq(schema.features.id, schema.editionFeatures.featureId))
    .where(eq(schema.editionFeatures.editionId, sub.editionId));
  return new Set(rows.map((r) => r.key));
}
