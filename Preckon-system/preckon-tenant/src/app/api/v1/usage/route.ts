import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/context";
import { query, queryOne } from "@/lib/db";

// GET /usage — what the AI is costing, per step and per project, live.
//
// Everything here comes from ai_usage_ledger, which has one row per ATTEMPT.
// That distinction is the reason this endpoint reads it rather than ai_job: a
// job that failed twice and then succeeded shows one row on ai_job and three
// here, and the bill is the three. Reporting from ai_job under-counts retries,
// which are exactly the calls nobody remembers paying for.
//
// Every figure is tenant-scoped. MySQL has no row-level security, so each query
// below states its tenant explicitly — there is no shared view to fall back on.

export const dynamic = "force-dynamic";

/** A query that must never take the page down; report what answered. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

export const GET = route(async (_req, ctx) => {
  // billing.view, not admin.settings: this is spend, and the person who needs
  // to see a bill is not always the person who administers the workspace.
  requirePermission(ctx, "billing.view");
  const T = ctx.tenantId;

  const [live, month, byStep, byProject, waste, recent] = await Promise.all([
    // ── Running now. From ai_job, because a queued job has no ledger row yet:
    //    the ledger records what an attempt COST, and this one has not run.
    safe(() => queryOne<any>(
      `SELECT
         SUM(status = 'queued')                                         AS queued,
         SUM(status = 'running')                                        AS running,
         COALESCE(MAX(CASE WHEN status = 'queued'
                           THEN TIMESTAMPDIFF(SECOND, queued_at, NOW()) END), 0) AS oldest_wait_s
       FROM ai_job WHERE tenant_id = ?`, [T]), null),

    // ── This month, and what that projects to. The projection is linear on
    //    elapsed days — crude, and honest about being crude; it is a running
    //    total extrapolated, not a forecast.
    safe(() => queryOne<any>(
      `SELECT
         COUNT(*)                                    AS calls,
         COALESCE(SUM(input_tokens), 0)              AS in_tokens,
         COALESCE(SUM(output_tokens), 0)             AS out_tokens,
         COALESCE(SUM(cost_minor), 0)                AS cost_minor,
         COALESCE(SUM(cache_hit), 0)                 AS cache_hits,
         COALESCE(SUM(outcome <> 'succeeded'), 0)    AS failed,
         DAY(LAST_DAY(CURDATE()))                    AS days_in_month,
         DAY(CURDATE())                              AS day_of_month
       FROM ai_usage_ledger
       WHERE tenant_id = ? AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`, [T]), null),

    // ── Per step. execution_class is grouped, not summed away: a stub row
    //    carries token counts and costs nothing, so folding it in with real
    //    model calls would report usage that never happened.
    safe(() => query<any>(
      `SELECT module, task_type, execution_class,
              COUNT(*)                          AS calls,
              ROUND(AVG(input_tokens))          AS in_avg,
              ROUND(AVG(output_tokens))         AS out_avg,
              MAX(input_tokens + output_tokens) AS worst,
              COALESCE(SUM(cost_minor), 0)      AS cost_minor,
              ROUND(AVG(NULLIF(latency_ms, 0))) AS ms_avg,
              COALESCE(SUM(cache_hit), 0)       AS cached,
              COALESCE(SUM(outcome <> 'succeeded'), 0) AS failed,
              COALESCE(SUM(validation_status = 'no_outputs'), 0) AS empty_answers,
              ROUND(AVG(confidence), 3)         AS conf_avg
         FROM ai_usage_ledger
        WHERE tenant_id = ? AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        GROUP BY module, task_type, execution_class
        ORDER BY cost_minor DESC, calls DESC
        LIMIT 60`, [T]), []),

    safe(() => query<any>(
      `SELECT p.id, p.name, p.code,
              COUNT(*)                       AS calls,
              COALESCE(SUM(u.input_tokens + u.output_tokens), 0) AS tokens,
              COALESCE(SUM(u.cost_minor), 0) AS cost_minor,
              COALESCE(SUM(u.outcome <> 'succeeded'), 0) AS failed
         FROM ai_usage_ledger u
         JOIN project p ON p.id = u.project_id AND p.tenant_id = u.tenant_id
        WHERE u.tenant_id = ? AND u.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        GROUP BY p.id, p.name, p.code
        ORDER BY cost_minor DESC LIMIT 40`, [T]), []),

    // ── Spend with nothing to show for it. A failed call and an empty answer
    //    both bill in full, and neither produces an artifact.
    safe(() => query<any>(
      `SELECT task_type,
              COALESCE(validation_status, outcome) AS reason,
              COUNT(*)                             AS calls,
              COALESCE(SUM(cost_minor), 0)         AS cost_minor,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
         FROM ai_usage_ledger
        WHERE tenant_id = ?
          AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
          AND (outcome <> 'succeeded' OR validation_status = 'no_outputs')
        GROUP BY task_type, reason
        ORDER BY tokens DESC LIMIT 30`, [T]), []),

    safe(() => query<any>(
      `SELECT u.task_type, u.execution_class, u.model_alias, u.attempt,
              u.input_tokens, u.output_tokens, u.cost_minor, u.latency_ms,
              u.outcome, u.validation_status, u.created_at, p.name AS project
         FROM ai_usage_ledger u
         LEFT JOIN project p ON p.id = u.project_id AND p.tenant_id = u.tenant_id
        WHERE u.tenant_id = ?
        ORDER BY u.created_at DESC LIMIT 40`, [T]), []),
  ]);

  const days = Number(month?.days_in_month ?? 30);
  const today = Math.max(1, Number(month?.day_of_month ?? 1));
  const spent = Number(month?.cost_minor ?? 0);

  return ok({
    live: {
      queued: Number(live?.queued ?? 0),
      running: Number(live?.running ?? 0),
      oldestWaitSeconds: Number(live?.oldest_wait_s ?? 0),
    },
    month: {
      calls: Number(month?.calls ?? 0),
      inputTokens: Number(month?.in_tokens ?? 0),
      outputTokens: Number(month?.out_tokens ?? 0),
      costMinor: spent,
      cacheHits: Number(month?.cache_hits ?? 0),
      failed: Number(month?.failed ?? 0),
      /* Linear on elapsed days. Stated as projected, never as forecast. */
      projectedCostMinor: Math.round((spent / today) * days),
      dayOfMonth: today,
      daysInMonth: days,
    },
    byStep: byStep ?? [],
    byProject: byProject ?? [],
    waste: waste ?? [],
    recent: recent ?? [],
  });
});
