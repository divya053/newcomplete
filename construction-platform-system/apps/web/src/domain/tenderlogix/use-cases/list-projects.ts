import { withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { TenderProjectRepository } from "../repository";

/**
 * List the tenant's tender projects. A read still authorizes + tenant-scopes
 * (steps 2 + 3); no audit row for a pure read.
 */
export async function listTenderProjects(ctx: RequestContext) {
  requirePermission(ctx, PERMISSIONS.TENDER_PROJECT_MANAGE);
  return withTenant(ctx.orgId, async (tx) => {
    const repo = new TenderProjectRepository(tx, ctx.orgId);
    return repo.list();
  });
}
