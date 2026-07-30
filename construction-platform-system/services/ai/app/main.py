"""FastAPI app for the stateless AI tier (ws 0.1). Phase 0 exposes only /health;
the AI tier does its real work as an arq/seam CONSUMER (app/worker.py), not via
HTTP endpoints — TS never calls Python directly (guardrail #1). This HTTP surface
is for liveness/readiness only.

Run:  uvicorn app.main:app --port 8000
"""

from fastapi import FastAPI

from app.settings import get_settings

app = FastAPI(title="Construction Intelligence — AI tier", version="0.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    # Touch settings so a misconfigured deploy fails its readiness check (ws 0.6).
    get_settings()
    return {"status": "ok", "runtime": "ai"}
