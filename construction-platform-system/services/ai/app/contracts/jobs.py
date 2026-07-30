"""Pydantic mirrors of the packages/shared job contract (ws 0.1, guardrail #6).

The envelope is the ONLY thing that crosses the seam. The tenant (org_id) and the
correlation id travel WITH the job — the worker never infers them. The worker
returns a JobResult, which is a PROPOSAL; the TS domain decides what to persist.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

JobType = Literal["noop_probe"]

# Keep in sync with packages/shared/src/jobs.ts.
JOB_QUEUE = "ci:jobs"
JOB_RESULT_PREFIX = "ci:result:"


class JobEnvelope(BaseModel):
    jobId: str
    type: JobType
    orgId: str
    correlationId: str
    idempotencyKey: str
    payload: dict[str, Any] = Field(default_factory=dict)


class JobError(BaseModel):
    code: str
    message: str


class JobResult(BaseModel):
    jobId: str
    status: Literal["done", "failed"]
    result: dict[str, Any] | None = None
    error: JobError | None = None
