import { audit, withTenant } from "@ci/db";
import { canTransition, type LifecycleState, PERMISSIONS } from "@ci/shared";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { TenderBoqRepository } from "../repository";

/**
 * Move a BOQ line through the artifact lifecycle — the human-in-the-loop gate
 * (ai_generated → under_review → approved → published → archived). The DOMAIN
 * enforces the allowed transition; the AI tier never sets state (guardrail #1).
 * Every transition is audited (guardrail #4).
 *
 *   validate -> authorize -> tenant-scope -> work (lifecycle move) -> audit
 */
export async function transitionBoqLine(ctx: RequestContext, boqItemId: string, to: LifecycleState) {
  requirePermission(ctx, PERMISSIONS.TENDER_BOQ_APPROVE); // 2. authorize (QS sign-off)

  return withTenant(ctx.orgId, async (tx) => {
    const repo = new TenderBoqRepository(tx, ctx.orgId);
    const line = await repo.find(boqItemId); // 3. tenant-scope (scoped read)
    if (!line) throw new NotFoundError("BOQ item");

    const from = line.lifecycleState as LifecycleState;
    if (!canTransition(from, to)) throw new ValidationError(`illegal transition ${from} -> ${to}`);

    await repo.setLifecycleState(boqItemId, to); // 4. work
    await audit(tx, ctx, {
      // 5. audit
      action: "tender.boq.transitioned",
      entityType: "tender_boq_item",
      entityId: boqItemId,
      before: { lifecycleState: from },
      after: { lifecycleState: to },
    });
    return { id: boqItemId, from, to };
  });
}
