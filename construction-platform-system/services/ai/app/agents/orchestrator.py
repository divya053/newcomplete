"""The agent/orchestrator scaffold (ws 0.10.3) — agents are CONFIGURATIONS, not
bespoke code (guardrail #8). A module's AI work is declared as an AgentConfig: an
ordered list of typed steps + an output schema. The orchestrator runs the pipeline;
adding a module means adding a config, not a new worker.

No agent ships in Phase 0 — this proves the typed pipeline RUNS (a no-op step),
so Phase 3 fills in real steps against a fixed shape.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

TOut = TypeVar("TOut", bound=BaseModel)

# A step takes the running context dict and returns a (partial) update to merge.
Step = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


@dataclass
class AgentConfig(Generic[TOut]):
    """A declared pipeline: name + ordered steps + the Pydantic output schema.

    The output is a PROPOSAL the TS domain decides to persist (guardrail #1).
    """

    name: str
    steps: list[Step]
    output_schema: type[TOut]
    metadata: dict[str, Any] = field(default_factory=dict)


async def run_pipeline(config: AgentConfig[TOut], initial: dict[str, Any]) -> TOut:
    state: dict[str, Any] = dict(initial)
    for step in config.steps:
        state.update(await step(state))
    # Validate the assembled output against the declared schema (guardrail #6).
    return config.output_schema.model_validate(state)


# --- A trivial no-op pipeline proving the scaffold runs (Phase 0) ---
class _NoopOutput(BaseModel):
    echo: str


async def _echo_step(state: dict[str, Any]) -> dict[str, Any]:
    return {"echo": state.get("echo", "ping")}


NOOP_AGENT: AgentConfig[_NoopOutput] = AgentConfig(
    name="noop",
    steps=[_echo_step],
    output_schema=_NoopOutput,
)
