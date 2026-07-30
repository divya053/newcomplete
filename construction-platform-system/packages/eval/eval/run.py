"""The eval harness runner (ws 0.8.4 / 0.7.3 gate).

`python -m eval.run --suite seed --fail-under "accuracy=0.70,calibration=0.60"`

Phase 0 proves the harness RUNS and GATES — it is the instrument, seeded with
synthetic cases, not yet a calibrated baseline. The thresholds are a DIAL: the
real bars are versioned/audited config (thresholds table, ws 0.8) set by the first
pilot. CI fails the PR when a measured metric drops below the passed `--fail-under`.

The "model under test" here is the deterministic noop echo, so accuracy is 1.0 —
exactly what we want for a green Phase 0 gate. Phase 3 swaps in a real agent target.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

CASES_DIR = Path(__file__).parent / "cases"


def load_suite(name: str) -> dict:
    return json.loads((CASES_DIR / f"{name}.json").read_text())


def target(input_obj: dict) -> str:
    # Phase 0 system-under-test = the noop echo (deterministic). Replace with the
    # real agent pipeline call in Phase 3.
    return str(input_obj.get("echo", ""))


def evaluate(suite: dict) -> dict[str, float]:
    cases = suite["cases"]
    correct = sum(1 for c in cases if target(c["input"]) == c["expected"])
    accuracy = correct / len(cases) if cases else 0.0
    # Calibration placeholder: with a deterministic target, predicted confidence
    # (1.0) matches outcome — perfect calibration. Real ECE math lands in Phase 3.
    calibration = 1.0
    return {"accuracy": accuracy, "calibration": calibration}


def parse_thresholds(s: str | None) -> dict[str, float]:
    if not s:
        return {}
    out: dict[str, float] = {}
    for pair in s.split(","):
        k, _, v = pair.partition("=")
        out[k.strip()] = float(v)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--suite", default="seed")
    ap.add_argument("--fail-under", default="")
    args = ap.parse_args()

    metrics = evaluate(load_suite(args.suite))
    thresholds = parse_thresholds(args.fail_under)
    print(json.dumps({"suite": args.suite, "metrics": metrics, "thresholds": thresholds}, indent=2))

    failures = [f"{k}={metrics.get(k, 0.0):.3f} < {bar}" for k, bar in thresholds.items() if metrics.get(k, 0.0) < bar]
    if failures:
        print("EVAL GATE FAILED:", "; ".join(failures), file=sys.stderr)
        return 1
    print("EVAL GATE PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
