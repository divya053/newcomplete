"""Provider abstraction for Claude (ws 0.1, 0.10.3). Agents call THIS, never the
SDK directly, so the provider is swappable and every call is one place to attach
Langfuse cost/latency telemetry (ws 0.8). A second provider is deferred to its
trigger (not Phase 0) — but the seam is fixed now.

Claude Opus for the hard/agentic work; Haiku for cheap/fast steps. No call is made
in Phase 0; this is the boundary the agent steps will use.
"""

from __future__ import annotations

# Latest Claude family (per platform canon). Pin model ids in one place.
MODEL_OPUS = "claude-opus-4-8"
MODEL_HAIKU = "claude-haiku-4-5-20251001"


class AnthropicAdapter:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        # self._client = anthropic.AsyncAnthropic(api_key=api_key)  # wired in Phase 3

    async def complete(self, *, prompt: str, model: str = MODEL_HAIKU) -> str:
        # TODO(Phase 3): real call + Langfuse span (model/tokens/latency/cost).
        raise NotImplementedError("Anthropic calls are wired with the first agent (Phase 3)")
