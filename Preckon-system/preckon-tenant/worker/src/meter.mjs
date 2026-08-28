// What a job actually spent, accumulated across every model call it made.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// agents.mjs reported a fixed usage for every job:
//
//   { input_tokens: 500, output_tokens: 120, cost_minor: 8 }
//
// So the ledger, the Admin usage page and every budget check were reading the
// same three constants regardless of what ran. On the live workspace that
// showed as an identical 250 in / 60 out on every task type and exactly $0.04
// per call — a bill computed from a literal.
//
// Anthropic returns real counts on `usage` in every response. Three call sites
// make those requests (agents.mjs, agentic-loop.mjs, vision.mjs) and one job
// routinely uses several of them: a vision pre-pass, then an agentic loop of up
// to six turns. Threading a total back through all of those signatures would
// touch every function between; an accumulator keyed to the job does not.
//
// AsyncLocalStorage rather than a module-level object, because the worker serves
// concurrent HTTP requests. A shared mutable total would bill one project for
// another project's tokens, and would do it silently.

import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage();

/** Run `fn` with a fresh meter. Returns whatever `fn` returns. */
export function withMeter(fn) {
  return store.run({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, calls: 0 }, fn);
}

/**
 * Add one Anthropic `usage` block.
 *
 * Silent when there is no meter — vision and the loop are callable outside a
 * job, and metering must never be the reason work fails.
 *
 * cache_read_input_tokens is counted BOTH into inputTokens and separately as
 * cached: it is real input the model processed, and it is charged at a
 * different rate. Keeping only the discounted figure would under-report the
 * context a prompt actually used.
 */
export function record(usage) {
  const m = store.getStore();
  if (!m || !usage) return;
  const fresh = Number(usage.input_tokens ?? 0) || 0;
  const cacheRead = Number(usage.cache_read_input_tokens ?? 0) || 0;
  const cacheWrite = Number(usage.cache_creation_input_tokens ?? 0) || 0;
  m.inputTokens += fresh + cacheRead + cacheWrite;
  m.cachedInputTokens += cacheRead;
  m.outputTokens += Number(usage.output_tokens ?? 0) || 0;
  m.calls += 1;
}

/** The running total, or null outside a metered job. */
export function readMeter() {
  const m = store.getStore();
  return m ? { ...m } : null;
}
