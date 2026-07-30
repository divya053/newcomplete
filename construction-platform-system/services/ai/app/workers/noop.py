"""The noop_probe handler (ws 0.1) — the only job Phase 0 ships.

Proves the seam round-trips without any domain effect. It echoes its payload back.
Real agent jobs (Phase 3+) follow the same shape: consume envelope -> run an
AgentConfig pipeline -> return a JobResult (a PROPOSAL). The worker NEVER writes
domain state (guardrail #1).
"""

from app.contracts.jobs import JobEnvelope, JobResult


async def handle_noop_probe(env: JobEnvelope) -> JobResult:
    echo = str(env.payload.get("echo", "ping"))
    return JobResult(jobId=env.jobId, status="done", result={"echo": echo})
