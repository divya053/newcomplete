// Metering for the calls Core makes through the worker's /claude proxy.
//
// ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────
//
// Four files reach Anthropic. Three of them are inside the worker's job runner
// and every one records what it spent. The fourth is worker/src/server.mjs — the
// `/claude` proxy — and it recorded nothing, because it cannot: the worker holds
// the API key precisely so that it holds nothing else, and a process with no
// database cannot append to a ledger.
//
// The three routes that use that proxy are the drawing and BIM assistants:
//
//   /projects/{pid}/bim/agent
//   /projects/{pid}/cad/agent
//   /projects/{pid}/cad/assistant
//
// Each drives an agentic loop — several turns, tool calls, a vision pre-pass on
// a rasterised sheet. That is the most expensive shape of request the product
// makes, and none of it appeared on the usage page. "Spent this month" was
// answering a narrower question than it looked like it was answering.
//
// The fix belongs on this side of the boundary rather than the other: the proxy
// returns Anthropic's response body verbatim, `usage` included, and Core is the
// half that knows the tenant, the project and the rate card. So Core reads what
// came back and writes the row.
//
// ── ONE ROW PER TURN ─────────────────────────────────────────────────────────
//
// A loop of six turns writes six rows, each with its own `attempt`. That matches
// how the ledger already treats retries — one row per ATTEMPT, not per job —
// and it is the only way the per-step averages on the usage page mean anything
// for a multi-turn conversation.

import { recordUsage, priceUsage } from "./store";
import { TIER_ALIAS } from "./registry";
import { logWarn } from "../log";

/** The `usage` block Anthropic returns, as it arrives through the proxy. */
export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface AssistantCall {
  tenantId: string;
  projectId?: string | null;
  /** e.g. "drawlogix" — the module the usage page groups by. */
  module: string;
  /** e.g. "bim.assistant" — what shows in the Step column. */
  taskType: string;
  /** Which turn of the loop this was. 1-based, like the job runner's attempts. */
  attempt?: number;
  /** The concrete model id the proxy was asked for. */
  providerModel?: string | null;
  tier?: string | null;
  usage: AnthropicUsage | undefined;
  latencyMs?: number;
  /** False when the turn errored; the tokens were still spent and still count. */
  ok?: boolean;
  errorCode?: string | null;
}

/**
 * Append one assistant turn to the usage ledger.
 *
 * Never throws, and never awaited on the response path in a way that could delay
 * a reply — metering must not be able to break the thing it measures. A failure
 * here is logged and dropped.
 */
export async function meterAssistantCall(call: AssistantCall): Promise<void> {
  try {
    const u = call.usage;
    const fresh = Number(u?.input_tokens ?? 0) || 0;
    const cacheRead = Number(u?.cache_read_input_tokens ?? 0) || 0;
    const cacheWrite = Number(u?.cache_creation_input_tokens ?? 0) || 0;
    const outputTokens = Number(u?.output_tokens ?? 0) || 0;

    /* Cache reads and writes are input the model processed and we were billed
       for, so they belong in inputTokens. The read figure is carried separately
       too, because it prices differently — the same split worker/src/meter.mjs
       makes for the job path. */
    const inputTokens = fresh + cacheRead + cacheWrite;

    // A turn that spent nothing is not worth a row. It would drag every average
    // on the usage page toward zero and represents no money.
    if (inputTokens <= 0 && outputTokens <= 0) return;

    const alias = call.tier ? TIER_ALIAS[call.tier] ?? null : null;
    const costMinor = await priceUsage(alias, {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_input_tokens: cacheRead,
    });

    await recordUsage({
      tenantId: call.tenantId,
      projectId: call.projectId ?? null,
      attempt: call.attempt ?? 1,
      module: call.module,
      taskType: call.taskType,
      // A real call to a third-party model, the same class the job runner records
      // for its own Anthropic calls. Not `local`, and never `stub`.
      executionClass: "external",
      modelAlias: alias,
      provider: "anthropic",
      providerModel: call.providerModel ?? null,
      inputTokens,
      outputTokens,
      costMinor,
      latencyMs: call.latencyMs ?? 0,
      cacheHit: cacheRead > 0,
      outcome: call.ok === false ? "failed" : "succeeded",
      errorCode: call.errorCode ?? null,
    });
  } catch (e) {
    logWarn("ai.assistant.meter_failed", { taskType: call.taskType, error: String(e) });
  }
}

/**
 * Pull the usage block out of whatever the proxy handed back.
 *
 * The three routes parse the proxy response in slightly different ways and one
 * of them keeps the raw text, so this takes either and never throws — an
 * unparseable body means no meter row, not a failed request.
 */
export function usageFrom(body: unknown): AnthropicUsage | undefined {
  try {
    const o = typeof body === "string" ? JSON.parse(body) : body;
    const u = (o as any)?.usage;
    return u && typeof u === "object" ? (u as AnthropicUsage) : undefined;
  } catch {
    return undefined;
  }
}
