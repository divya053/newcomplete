// Every tool_use must be answered by a tool_result.
//
// ── THE BUG THIS PINS ────────────────────────────────────────────────────────
//
// The loop took the FIRST tool_use from the turn, pushed the whole assistant
// message, and answered only that one. A model may emit several tool calls in a
// single message, and does so more readily as a task gets more involved — so
// the extra calls went unanswered and the API rejected the NEXT request:
//
//   messages.2: `tool_use` ids were found without `tool_result` blocks
//   immediately after: toolu_… Each `tool_use` block must have a corresponding
//   `tool_result` block in the next message.
//
// From the outside this looked like "BIM Studio works for two or three
// instructions and then stops": the more the model had to plan, the likelier it
// was to batch its calls, and the first batch poisoned the conversation.
//
// The invariant is structural, so it is worth a structural test — the failure
// was invisible until it reached the provider, and nothing here checked it.

import { describe, it, expect } from "vitest";
import { runBimAgent2 } from "@/lib/bim/agent2";
import { ToolRegistry } from "@/lib/bim/registry";
import { emptyDocument, type BimDocument } from "@/lib/bim/model";
import type { Command } from "@/lib/bim/commands";

/** Collect every tool_use id sent, and every tool_result id returned. */
function conversationAudit(turns: any[]) {
  let turn = 0;
  const seen: any[][] = [];

  const callAnthropic = async (req: { messages: any[] }) => {
    // Snapshot what the loop is about to send, so the invariant can be checked
    // against exactly the payload the API would have received.
    seen.push(JSON.parse(JSON.stringify(req.messages)));
    return turns[Math.min(turn++, turns.length - 1)];
  };

  return { callAnthropic, sent: () => seen };
}

/** Ids of tool_use blocks that have no tool_result in the following message. */
function unanswered(messages: any[]): string[] {
  const missing: string[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;

    const uses = m.content.filter((c: any) => c?.type === "tool_use").map((c: any) => c.id);
    if (!uses.length) continue;

    const next = messages[i + 1];
    const answered = Array.isArray(next?.content)
      ? next.content.filter((c: any) => c?.type === "tool_result").map((c: any) => c.tool_use_id)
      : [];
    for (const id of uses) if (!answered.includes(id)) missing.push(id);
  }
  return missing;
}

const registry = () => {
  const r = new ToolRegistry<BimDocument, Command>();
  r.register({
    name: "count_things", label: "Count Things", module: "Selection",
    scope: "global", kind: "read",
    description: "Count elements.", params: [],
    run: () => ({ ok: true, summary: "Counted.", data: { n: 0 } }),
  });
  return r;
};

const base = () => ({
  instruction: "do the thing",
  doc: emptyDocument(),
  registry: registry(),
  apply: async (cmds: Command[]) => ({ doc: emptyDocument(), applied: cmds.length }),
  model: "test-model",
});

const use = (id: string, tool: string) =>
  ({ type: "tool_use", id, name: "run_tool", input: { tool, args: {} } });

describe("every tool_use is answered", () => {
  it("answers a single tool call", async () => {
    const turns = [
      { content: [use("t1", "count_things")] },
      { content: [{ type: "text", text: "Done." }] },
    ];
    const audit = conversationAudit(turns);
    await runBimAgent2({ ...base(), callAnthropic: audit.callAnthropic } as any);

    const last = audit.sent().at(-1)!;
    expect(unanswered(last)).toEqual([]);
  });

  it("answers EVERY call when the model batches them", async () => {
    /* The exact failure. Three tool_use blocks in one assistant message; the
       old loop answered t1 and left t2 and t3 dangling, and the next request
       was rejected outright. */
    const turns = [
      { content: [use("t1", "count_things"), use("t2", "count_things"), use("t3", "count_things")] },
      { content: [{ type: "text", text: "Done." }] },
    ];
    const audit = conversationAudit(turns);
    await runBimAgent2({ ...base(), callAnthropic: audit.callAnthropic } as any);

    const last = audit.sent().at(-1)!;
    expect(unanswered(last)).toEqual([]);
  });

  it("answers a batch that mixes a known and an unknown tool", async () => {
    // An unrecognised name must still be answered, or it poisons the next turn
    // exactly like a valid one would.
    const turns = [
      { content: [use("t1", "count_things"), use("t2", "no_such_tool")] },
      { content: [{ type: "text", text: "Done." }] },
    ];
    const audit = conversationAudit(turns);
    await runBimAgent2({ ...base(), callAnthropic: audit.callAnthropic } as any);

    expect(unanswered(audit.sent().at(-1)!)).toEqual([]);
  });

  it("puts the results in one user message, as the API requires", async () => {
    const turns = [
      { content: [use("t1", "count_things"), use("t2", "count_things")] },
      { content: [{ type: "text", text: "Done." }] },
    ];
    const audit = conversationAudit(turns);
    await runBimAgent2({ ...base(), callAnthropic: audit.callAnthropic } as any);

    const last = audit.sent().at(-1)!;
    const resultMsgs = last.filter(
      (m: any) => Array.isArray(m.content) && m.content.some((c: any) => c?.type === "tool_result"),
    );
    expect(resultMsgs).toHaveLength(1);
    expect(resultMsgs[0].content).toHaveLength(2);
  });

  it("holds across several turns of batched calls", async () => {
    /* The reported symptom was cumulative — it worked, then stopped. Three
       turns, each batching, is the shape that used to fail. */
    const turns = [
      { content: [use("a1", "count_things"), use("a2", "count_things")] },
      { content: [use("b1", "count_things"), use("b2", "count_things")] },
      { content: [use("c1", "count_things")] },
      { content: [{ type: "text", text: "Done." }] },
    ];
    const audit = conversationAudit(turns);
    await runBimAgent2({ ...base(), callAnthropic: audit.callAnthropic } as any);

    for (const payload of audit.sent()) {
      expect(unanswered(payload)).toEqual([]);
    }
  });

  it("stops cleanly when the model returns no tool call at all", async () => {
    const turns = [{ content: [{ type: "text", text: "Nothing to do." }] }];
    const audit = conversationAudit(turns);
    const out = await runBimAgent2({ ...base(), callAnthropic: audit.callAnthropic } as any);
    expect(out.reply).toMatch(/nothing to do/i);
  });
});

describe("the detector itself", () => {
  it("catches an unanswered tool_use, so a green test means something", () => {
    /* Without this the suite above could pass by never finding any tool_use at
       all — which is exactly the kind of vacuous pass that let the original bug
       through. */
    const broken = [
      { role: "user", content: "go" },
      { role: "assistant", content: [use("t1", "x"), use("t2", "x")] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] },
    ];
    expect(unanswered(broken)).toEqual(["t2"]);
  });
});
