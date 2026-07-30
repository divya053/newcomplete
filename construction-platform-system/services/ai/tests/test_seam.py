"""The handler unit test (ws 0.7 ci-python). Proves the noop_probe handler echoes
its payload — the worker loop + Redis are exercised by the integration round-trip
in the runbook (exit gate #1)."""

import pytest

from app.contracts.jobs import JobEnvelope
from app.workers.noop import handle_noop_probe


@pytest.mark.asyncio
async def test_noop_probe_echoes() -> None:
    env = JobEnvelope(
        jobId="j1",
        type="noop_probe",
        orgId="o1",
        correlationId="c1",
        idempotencyKey="k1",
        payload={"echo": "hello-seam"},
    )
    result = await handle_noop_probe(env)
    assert result.status == "done"
    assert result.result == {"echo": "hello-seam"}
