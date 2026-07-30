import { randomUUID } from "node:crypto";
import { audit, db, schema, withTenant } from "@ci/db";
import { and, desc, eq } from "drizzle-orm";
import { PERMISSIONS } from "@ci/shared";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { NotFoundError } from "@/server/errors";
import { type EditionView, listEditions } from "./host";

/** The tenant's current plan + the editions they can switch to (upgrade/downgrade). */
export async function getMyPlan(ctx: RequestContext): Promise<{ current: EditionView | null; editions: EditionView[] }> {
  const editions = await listEditions();
  const sub = (
    await db
      .select({ editionId: schema.orgSubscriptions.editionId })
      .from(schema.orgSubscriptions)
      .where(and(eq(schema.orgSubscriptions.orgId, ctx.orgId), eq(schema.orgSubscriptions.status, "active")))
      .orderBy(desc(schema.orgSubscriptions.createdAt))
      .limit(1)
  )[0];
  const current = sub ? (editions.find((e) => e.id === sub.editionId) ?? null) : null;
  return { current, editions };
}

/** Tenant self-service upgrade/downgrade (org admins only). */
export async function changeEdition(ctx: RequestContext, editionId: string) {
  requirePermission(ctx, PERMISSIONS.ROLE_MANAGE); // org admin/owner
  const edition = (await db.select({ id: schema.editions.id }).from(schema.editions).where(eq(schema.editions.id, editionId)).limit(1))[0];
  if (!edition) throw new NotFoundError("edition");
  await withTenant(ctx.orgId, async (tx) => {
    await tx.update(schema.orgSubscriptions).set({ status: "cancelled" }).where(and(eq(schema.orgSubscriptions.orgId, ctx.orgId), eq(schema.orgSubscriptions.status, "active")));
    await tx.insert(schema.orgSubscriptions).values({ id: randomUUID(), orgId: ctx.orgId, editionId, status: "active" });
    await audit(tx, ctx, { action: "subscription.changed", entityType: "org", entityId: ctx.orgId, after: { editionId } });
  });
  return { editionId };
}
