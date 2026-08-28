// Tokens and cost must be measured, not asserted.
//
// ── THE BUG THIS PINS ────────────────────────────────────────────────────────
//
// worker/src/agents.mjs reported the same usage for every job of every type:
//
//   { model: …, input_tokens: 500, output_tokens: 120, cost_minor: 8 }
//
// Three constants. So the ledger, the Admin usage page and every budget check
// were reading a literal. On the live workspace it showed as an identical
// 250 in / 60 out on every row and exactly $0.04 per call, across six different
// task types — arithmetic that only looks plausible until you notice a copilot
// answer and a bill derivation cannot cost the same to the cent.
//
// Anthropic returns real counts on `usage`. The worker discarded them:
// callAnthropic read data.content and never data.usage.
//
// Two rules now hold, and this file checks both.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { costMinor } from "@/lib/ai/budget";

const ROOT = join(__dirname, "..");
const agents = readFileSync(join(ROOT, "worker", "src", "agents.mjs"), "utf8");
const jobs = readFileSync(join(ROOT, "src", "lib", "jobs.ts"), "utf8");

describe("the worker measures usage rather than declaring it", () => {
  it("still has the usage() it is pinned to, so a pass is not vacuous", () => {
    expect(agents).toMatch(/function usage\(env\)/);
  });

  it("does not return hard-coded token counts", () => {
    const body = agents.slice(agents.indexOf("function usage(env)"));
    const fn = body.slice(0, body.indexOf("\n}"));
    expect(
      fn,
      "\n\nusage() returns literal token counts again. Every ledger row, every\n" +
        "budget check and the whole Admin usage page then report a constant.\n",
    ).not.toMatch(/input_tokens:\s*\d+[1-9]/);
    expect(fn).not.toMatch(/output_tokens:\s*\d+[1-9]/);
  });

  it("reads what the meter accumulated", () => {
    const body = agents.slice(agents.indexOf("function usage(env)"));
    expect(body.slice(0, body.indexOf("\n}"))).toMatch(/readMeter\(\)/);
  });

  it("records the usage block from the Anthropic response", () => {
    // The specific line that was missing: the response was parsed for content
    // and its usage thrown away.
    expect(agents).toMatch(/record\(data\.usage\)/);
  });
});

describe("Core prices those tokens, and the worker does not", () => {
  it("the worker sends no price", () => {
    const body = agents.slice(agents.indexOf("function usage(env)"));
    expect(body.slice(0, body.indexOf("\n}"))).toMatch(/cost_minor:\s*0/);
  });

  it("the ledger cost comes from the rate card, not from the result", () => {
    expect(
      jobs,
      "\n\njobs.ts is writing the worker's cost_minor into the ledger again.\n" +
        "The worker has no rate card, so that figure can only be a constant.\n",
    ).not.toMatch(/costMinor:\s*result\.usage\?\.cost_minor/);
    expect(jobs).toMatch(/priceUsage\(/);
  });

  it("a cache hit is priced at zero", () => {
    // Charging for a served-from-cache answer erases the saving the cache
    // exists to produce, and makes the cache look like it did nothing.
    expect(jobs).toMatch(/servedFromCache\s*\?\s*0\s*:\s*await priceUsage/);
  });
});

describe("the rate card arithmetic", () => {
  // preckon-small, as seeded: 100 minor per million in, 500 per million out.
  const card = { inputPerMillionMinor: 100, outputPerMillionMinor: 500 };

  it("prices a real call from its tokens", () => {
    // 1M in + 1M out = 100 + 500
    expect(costMinor({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, card)).toBe(600);
  });

  it("distinguishes two differently sized calls", () => {
    /* The property the old constant destroyed: a small call and a large one
       must not cost the same. */
    const small = costMinor({ inputTokens: 2_000, outputTokens: 500 }, card);
    const large = costMinor({ inputTokens: 200_000, outputTokens: 50_000 }, card);
    expect(large).toBeGreaterThan(small);
  });

  it("charges cached input at the discounted rate when one is offered", () => {
    const withCache = { ...card, cachedInputPerMillionMinor: 10 };
    const allFresh = costMinor({ inputTokens: 1_000_000, outputTokens: 0 }, withCache);
    const allCached = costMinor(
      { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 1_000_000 },
      withCache,
    );
    expect(allFresh).toBe(100);
    expect(allCached).toBe(10);
  });

  it("rounds up, so the estimate never favours looking cheap", () => {
    expect(costMinor({ inputTokens: 1, outputTokens: 0 }, card)).toBe(1);
  });
});
