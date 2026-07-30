import { audit, withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { enqueue } from "@/lib/queue";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { NotFoundError } from "@/server/errors";
import { GenerateBoqInput } from "../model";
import { TenderProjectRepository } from "../repository";

/**
 * Kick off AI BOQ generation (guardrail #9: anything touching a model is async).
 * The spine here ends by ENQUEUEING an arq job — the Python AI tier consumes it,
 * runs the multi-agent pipeline, and returns a PROPOSAL. The domain (a separate
 * result handler) persists the proposed lines as `ai_generated` BOQ items for QS
 * review. The AI tier never writes domain state (guardrail #1).
 *
 *   validate -> authorize -> tenant-scope (verify project) -> enqueue -> audit
 */
export async function generateBoq(ctx: RequestContext, raw: unknown) {
  const input = GenerateBoqInput.parse(raw); // 1. validate
  requirePermission(ctx, PERMISSIONS.TENDER_BOQ_GENERATE); // 2. authorize

  const correlationId = ctx.correlationId;
  const idempotencyKey = `boq-gen:${input.projectId}`; // at-most-once per project run

  const jobId = await withTenant(ctx.orgId, async (tx) => {
    // 3. tenant-scope: confirm the project exists IN THIS TENANT before enqueueing
    const repo = new TenderProjectRepository(tx, ctx.orgId);
    const project = await repo.find(input.projectId);
    if (!project) throw new NotFoundError("tender project");

    // 4. enqueue the job (the tenant context travels WITH it)
    const id = await enqueue(
      "tender_boq_generate",
      { projectId: input.projectId, provider: input.provider, model: input.model },
      { orgId: ctx.orgId, correlationId, idempotencyKey },
    );

    // 5. audit the request (the result, when it lands, is audited separately on persist)
    await audit(tx, ctx, {
      action: "tender.boq.generation_requested",
      entityType: "tender_project",
      entityId: input.projectId,
      after: { jobId: id, provider: input.provider, model: input.model },
    });
    return id;
  });

  return { jobId, correlationId };
}
