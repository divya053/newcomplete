"""The seam consumer — the Python half of the one cross-runtime bridge (ws 0.1).

Phase 0 settle-in-build (§Appendix): the seam uses a thin Redis-list protocol so
the TS queue client can stay a few lines (RPUSH a JSON envelope; the worker BLPOPs,
dispatches on `function`, runs the handler, and SETs the JobResult under
ci:result:<jobId>). This keeps the seam genuinely round-tripping end-to-end.

arq is the production task runner for AGENT jobs from Phase 3 (retry/DLQ/idempotency
come from arq's job semantics); its WorkerSettings live alongside in app/agents. The
list protocol here is the Phase 0 probe path and the shape both share: envelope in,
proposal out, no shared DB writes.

Run:  python -m app.worker
"""

import asyncio
import json

import redis.asyncio as redis

from app.contracts.jobs import JOB_QUEUE, JOB_RESULT_PREFIX, JobEnvelope, JobError, JobResult
from app.settings import get_settings
from app.telemetry import bind_correlation, log
from app.workers.noop import handle_noop_probe

# Dispatch table — one entry per job type (mirrors packages/shared JOB_TYPES).
HANDLERS = {
    "noop_probe": handle_noop_probe,
}

RESULT_TTL_SECONDS = 300


async def consume() -> None:
    settings = get_settings()
    r = redis.from_url(settings.redis_url, decode_responses=True)
    log.info("ai.worker.started", queue=JOB_QUEUE)
    while True:
        # BLPOP blocks until a job arrives. (1s timeout so the loop can be cancelled.)
        item = await r.blpop([JOB_QUEUE], timeout=1)
        if item is None:
            continue
        _, raw = item
        await _process(r, raw)


async def _process(r: "redis.Redis", raw: str) -> None:
    try:
        msg = json.loads(raw)
        env = JobEnvelope.model_validate(msg["args"][0])  # validate at the boundary (#6)
    except Exception as e:  # malformed message — drop with a log (no result to write)
        log.error("ai.worker.bad_message", error=str(e))
        return

    bind_correlation(env.correlationId, env.orgId)
    handler = HANDLERS.get(env.type)
    if handler is None:
        result = JobResult(
            jobId=env.jobId, status="failed",
            error=JobError(code="unknown_job_type", message=env.type),
        )
    else:
        try:
            result = await handler(env)
            log.info("ai.worker.job_done", job_id=env.jobId, type=env.type)
        except Exception as e:  # user-visible failed state (guardrail #9)
            log.error("ai.worker.job_failed", job_id=env.jobId, error=str(e))
            result = JobResult(
                jobId=env.jobId, status="failed",
                error=JobError(code="handler_error", message=str(e)),
            )

    await r.set(JOB_RESULT_PREFIX + env.jobId, result.model_dump_json(), ex=RESULT_TTL_SECONDS)


if __name__ == "__main__":
    try:
        asyncio.run(consume())
    except KeyboardInterrupt:
        pass
