"""Structured logging + correlation-id propagation (ws 0.8, guardrail #7-adjacent).

Every log line carries correlation_id + org_id so a request can be followed
end-to-end across both runtimes (the TS side stamps the id; it rides the envelope
to here). Langfuse wiring (per-call model/token/latency/cost) hangs off the same
correlation id — added when LANGFUSE_* is configured.
"""

import structlog

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
)

log = structlog.get_logger()


def bind_correlation(correlation_id: str, org_id: str) -> None:
    structlog.contextvars.bind_contextvars(correlation_id=correlation_id, org_id=org_id)
