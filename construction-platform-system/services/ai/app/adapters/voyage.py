"""Provider abstraction for Voyage embeddings (ws 0.1). Default dimension 1024 is
the working reference — confirm before indexing for real (Phase 1). Embeddings are
written by the TS domain into pgvector tables (under RLS); the AI tier only
PRODUCES them (guardrail #1).
"""

from __future__ import annotations

EMBED_MODEL = "voyage-3"
EMBED_DIM = 1024


class VoyageAdapter:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def embed(self, texts: list[str]) -> list[list[float]]:
        # TODO(Phase 1): real call + Langfuse span.
        raise NotImplementedError("Voyage embedding is wired in Phase 1 ingest")
