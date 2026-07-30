import { randomUUID } from "node:crypto";
import { audit, withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { CreateProjectInput } from "../model";
import { TenderProjectRepository } from "../repository";

/**
 * Create a tender project — the canonical 5-step spine (guardrails #2/#3/#4/#6):
 *   validate -> authorize -> tenant-scope -> work (scoped repo) -> audit
 */
export async function createTenderProject(ctx: RequestContext, raw: unknown) {
  const input = CreateProjectInput.parse(raw); // 1. validate
  requirePermission(ctx, PERMISSIONS.TENDER_PROJECT_MANAGE); // 2. authorize

  const id = randomUUID();
  return withTenant(ctx.orgId, async (tx) => {
    // 3. tenant-scope  +  4. work (only through the scoped repository)
    const repo = new TenderProjectRepository(tx, ctx.orgId);
    await repo.create({ id, name: input.name, client: input.client, location: input.location, quotationRef: input.quotationRef });

    // 5. audit — same transaction as the change (atomic, immutable)
    await audit(tx, ctx, {
      action: "tender.project.created",
      entityType: "tender_project",
      entityId: id,
      after: { id, name: input.name, client: input.client ?? null },
    });
    return { id };
  });
}
