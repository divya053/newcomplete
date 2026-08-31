// Every call that spends the API key lands on the usage page.
//
// ── THE GAP THIS PINS ────────────────────────────────────────────────────────
//
// Four files reach api.anthropic.com. Three live inside the worker's job runner
// and each records what it spent through meter.mjs. The fourth is
// worker/src/server.mjs — the `/claude` proxy — and it recorded nothing.
//
// It cannot: the worker holds the API key precisely so that it holds nothing
// else, and a process with no database cannot append to a ledger.
//
// So the spend of the three routes that use that proxy — the BIM and drawing
// assistants, which run multi-turn agentic loops with tool calls and a vision
// pre-pass, the most expensive shape of request the product makes — never
// appeared on the Admin usage page. "Spent this month" was quietly answering a
// narrower question than it looked like it was answering.
//
// These tests fail if a new call site is added without metering, which is the
// only way this stays true.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

/** Every source file under a directory, minus build output. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const ALL = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "worker", "src"))];
const CALLERS = ALL.filter((f) => readFileSync(f, "utf8").includes("api.anthropic.com"));

describe("every place that spends the key is accounted for", () => {
  it("finds the call sites at all, so this is not vacuous", () => {
    expect(CALLERS.length).toBeGreaterThanOrEqual(4);
  });

  it("is a closed list — a new one has to be metered and added here", () => {
    /* Deliberately exact. A fifth file calling Anthropic should fail this test
       and make someone decide how its usage reaches the ledger, rather than
       silently spending money nobody can see. */
    const known = [
      "agents.mjs",        // job runner        → meter.mjs
      "agentic-loop.mjs",  // job runner loop   → meter.mjs
      "vision.mjs",        // sheet pre-pass    → meter.mjs
      "server.mjs",        // the /claude proxy → metered by its CALLER, below
    ].sort();
    expect(CALLERS.map((f) => f.split(/[\\/]/).pop()).sort()).toEqual(known);
  });

  it("every worker call site records into the meter", () => {
    for (const f of CALLERS) {
      const name = f.split(/[\\/]/).pop()!;
      if (name === "server.mjs") continue; // has no database; see below
      expect(readFileSync(f, "utf8"), `${name} calls Anthropic without record()`)
        .toMatch(/record\(\s*\w+\.usage\s*\)/);
    }
  });
});

describe("the proxy is metered by the routes that use it", () => {
  const ROUTES = [
    ["bim", "agent"],
    ["cad", "agent"],
    ["cad", "assistant"],
  ] as const;

  for (const [a, b] of ROUTES) {
    const src = read("src", "app", "api", "v1", "projects", "[pid]", a, b, "route.ts");

    it(`${a}/${b} meters every turn`, () => {
      expect(src, `${a}/${b} calls the /claude proxy without metering it`)
        .toMatch(/meterAssistantCall\(/);
    });

    it(`${a}/${b} meters inside the wrapper, so a loop records every turn`, () => {
      /* The meter must sit in callAnthropic, which every turn passes through
         once. Metering at the route's end would record one row for a six-turn
         conversation and under-report it fivefold. */
      const wrapper = src.slice(src.indexOf("const callAnthropic"));
      const body = wrapper.slice(0, wrapper.indexOf("\n  };"));
      expect(body).toMatch(/meterAssistantCall\(/);
    });

    it(`${a}/${b} records a failed turn too`, () => {
      // Those tokens were spent. Dropping them understates the bill in exactly
      // the cases someone is most likely to be investigating.
      const i = src.indexOf("meterAssistantCall(");
      const j = src.indexOf("if (!res.ok)", i - 800 > 0 ? i - 800 : 0);
      expect(i, "the meter must run BEFORE the error throw").toBeLessThan(j);
    });
  }
});

describe("one pricing path, so the ledger cannot disagree with itself", () => {
  it("priceUsage is shared, not duplicated", () => {
    // It was private to jobs.ts. Two writers pricing the same tokens by two
    // routes is how a bill starts contradicting the page that displays it.
    expect(read("src", "lib", "ai", "store.ts")).toMatch(/export async function priceUsage/);
    expect(read("src", "lib", "jobs.ts")).not.toMatch(/^async function priceUsage/m);
    expect(read("src", "lib", "ai", "assistant-usage.ts")).toMatch(/priceUsage\(/);
  });

  it("the assistant records external, never stub", () => {
    // A stub row carries token counts and costs nothing. Folding assistant
    // traffic in as anything but `external` would report usage that never
    // happened, or hide usage that did.
    const src = read("src", "lib", "ai", "assistant-usage.ts");
    expect(src).toMatch(/executionClass:\s*"external"/);
    expect(src).not.toMatch(/executionClass:\s*"stub"/);
  });

  it("counts cache reads and writes as the input they are", () => {
    const src = read("src", "lib", "ai", "assistant-usage.ts");
    expect(src).toMatch(/cache_read_input_tokens/);
    expect(src).toMatch(/cache_creation_input_tokens/);
    expect(src).toMatch(/fresh \+ cacheRead \+ cacheWrite/);
  });
});

describe("the usage page keeps itself current", () => {
  const src = read("src", "lib", "admin", "usage.tsx");

  it("polls while the period is still moving", () => {
    expect(src).toMatch(/setInterval\(/);
  });

  it("stops polling a period that cannot change", () => {
    // Re-fetching a closed month asks the database for numbers that are already
    // final, on a loop, forever.
    expect(src).toMatch(/if \(!live\) return;/);
  });
});
