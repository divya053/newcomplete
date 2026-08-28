import { z } from "zod";
import { route, ok } from "@/lib/http";
import { requirePermission, requireProject } from "@/lib/context";
import { query } from "@/lib/db";
import { actorFromCtx } from "@/lib/usecase";
import { assertWorkflowLicensed } from "@/lib/entitlements";
import { startRun } from "@/lib/runtime";

// §4.6 GET /projects/{pid}/runs — runs on the project.
export const GET = route<{ pid: string }>(async (_req, ctx, { pid }) => {
  requirePermission(ctx, "workflow.read");
  await requireProject(ctx, pid);
  /* Step counts travel with the run.
     The module surfaces poll this list to show a stage's progress, and without
     the counts a running stage could only say "running" — true for two seconds
     and for twenty minutes alike, which tells the person watching nothing.
     Joining here rather than adding a second request keeps one poll per screen;
     the join is on run_step's (run_id, status) index. */
  const runs = await query(
    `SELECT r.id, r.workflow_key, r.workflow_version, r.status, r.started_at, r.ended_at,
            COUNT(s.id)                                              AS steps_total,
            COALESCE(SUM(s.status IN ('completed','skipped')), 0)    AS steps_done,
            COALESCE(SUM(s.status = 'failed'), 0)                    AS steps_failed,
            MAX(CASE WHEN s.status = 'running' THEN s.agent_key END) AS running_agent
       FROM workflow_run r
       LEFT JOIN workflow_run_step s ON s.run_id = r.id AND s.tenant_id = r.tenant_id
      WHERE r.tenant_id = ? AND r.project_id = ?
      GROUP BY r.id, r.workflow_key, r.workflow_version, r.status, r.started_at, r.ended_at
      ORDER BY r.started_at DESC`,
    [ctx.tenantId, pid]
  );
  return ok(runs);
});

const StartRun = z.object({ workflow_key: z.string().min(1) });

// §4.6 POST /projects/{pid}/runs — resolve + start a run; dispatch ready steps; audit.
export const POST = route<{ pid: string }>(async (req, ctx, { pid }) => {
  requirePermission(ctx, "workflow.run");
  await requireProject(ctx, pid);
  const body = StartRun.parse(await req.json());
  await assertWorkflowLicensed(ctx.tenantId, body.workflow_key); // §8.3 entitlement check

  const runId = await startRun(actorFromCtx(ctx), {
    tenantId: ctx.tenantId,
    projectId: pid,
    userId: ctx.user.id,
    workflowKey: body.workflow_key,
  });
  return ok({ id: runId }, 201);
});
