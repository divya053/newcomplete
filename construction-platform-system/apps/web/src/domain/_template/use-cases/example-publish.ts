import { audit, withTenant } from "@ci/db";
import { PERMISSIONS, canTransition } from "@ci/shared";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { PublishExampleInput } from "../model";

/**
 * THE canonical use-case skeleton (ws 0.10) — the shape EVERY operation in EVERY
 * module takes. This is the load-bearing pattern of the whole platform:
 *
 *   validate -> authorize -> tenant-scope -> do the work -> audit
 *
 * Learn it once; every op reads the same. (A real module swaps the repository +
 * permission + action string; the spine never changes.)
 */
export async function publishExample(ctx: RequestContext, raw: unknown) {
  const input = PublishExampleInput.parse(raw); // 1. validate (boundary, guardrail #6)
  requirePermission(ctx, PERMISSIONS.ESTIMATE_PUBLISH); // 2. authorize (RBAC, server-side)

  return withTenant(ctx.orgId, async (tx) => {
    // 3. tenant-scope — app-enforced for ctx.orgId via the scoped repository
    //    (MariaDB has no RLS; the repo's org_id filter IS the boundary — see @ci/db)
    // 4. do the work — through the scoped repository (illustrative reads/writes):
    const before = { id: input.id, state: "approved" };
    if (!canTransition("approved", "published")) throw new ValidationError("illegal transition");
    const after = { id: input.id, state: "published" };
    if (!before) throw new NotFoundError("example");

    // 5. audit — same transaction as the change (atomic, immutable, guardrail #4)
    await audit(tx, ctx, {
      action: "example.published",
      entityType: "example",
      entityId: input.id,
      before,
      after,
    });
    return after; // (+ cost/trust telemetry emitted by the instruments — ws 0.8)
  });
}
