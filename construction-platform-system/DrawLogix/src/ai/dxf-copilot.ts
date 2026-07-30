import Anthropic from "@anthropic-ai/sdk";
import type { EditOp } from "@/domain/dxf-model";

/**
 * DXF edit copilot — Claude (Sonnet 4.6) turns a natural-language instruction into a
 * list of structured edit operations against an uploaded drawing. The geometry stays
 * on the client; we send only a SUMMARY (layer names, text labels, extents) and get
 * back operations the client applies deterministically.
 */
const MODEL = "claude-sonnet-4-6";

export interface ModelSummary {
  layers: string[];
  texts: string[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  insunits: number;
}

const APPLY_EDITS: Anthropic.Tool = {
  name: "apply_edits",
  description: "Apply edit operations to the DXF drawing and reply to the user.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "One short sentence describing what you changed (or why you couldn't)." },
      operations: {
        type: "array",
        description: "The edits to apply, in order.",
        items: {
          type: "object",
          properties: {
            op: {
              type: "string",
              enum: ["rename_layer", "set_layer_color", "hide_layer", "show_layer", "delete_layer", "replace_text", "delete_text", "add_text", "add_rectangle", "move", "scale"],
            },
            from: { type: "string" },
            to: { type: "string" },
            layer: { type: "string" },
            color: { type: "string", description: "colour name (red, blue, green, cyan, yellow, magenta, white, gray) or ACI number" },
            find: { type: "string" },
            replace: { type: "string" },
            text: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            w: { type: "number" },
            h: { type: "number" },
            dx: { type: "number" },
            dy: { type: "number" },
            factor: { type: "number" },
          },
          required: ["op"],
        },
      },
    },
    required: ["reply", "operations"],
  },
};

export async function editDxf(summary: ModelSummary, instruction: string): Promise<{ reply: string; operations: EditOp[] }> {
  const client = new Anthropic();
  const unitNote = summary.insunits === 4 ? " (millimetres)" : summary.insunits === 6 ? " (metres)" : "";
  const system = `You are a CAD copilot editing a DXF drawing. Apply the user's instruction by returning operations via apply_edits.
Operations: rename_layer{from,to}, set_layer_color{layer,color}, hide_layer{layer}, show_layer{layer}, delete_layer{layer}, replace_text{find,replace}, delete_text{find}, add_text{text,x?,y?,layer?}, add_rectangle{x,y,w,h,layer?,text?}, move{dx,dy}, scale{factor}.
Rules: use ONLY existing layer names for layer ops (create new layers only when adding). Coordinates are in drawing units; the drawing spans X ${summary.bounds.minX.toFixed(0)}..${summary.bounds.maxX.toFixed(0)}, Y ${summary.bounds.minY.toFixed(0)}..${summary.bounds.maxY.toFixed(0)}${unitNote}. Place added text/rooms inside or just above that range.
Layers: ${summary.layers.join(", ") || "(none)"}.
Text labels present: ${summary.texts.slice(0, 60).join(" | ") || "(none)"}.
If the instruction can't be done with these operations, return an empty operations array and explain in reply.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    tools: [APPLY_EDITS],
    tool_choice: { type: "tool", name: "apply_edits" },
    messages: [{ role: "user", content: instruction }],
  });

  const tu = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const input = (tu?.input ?? {}) as { reply?: string; operations?: unknown[] };
  const operations = (Array.isArray(input.operations) ? input.operations : []).map(normalizeOp).filter((o): o is EditOp => Boolean(o));
  return { reply: String(input.reply ?? "Done."), operations };
}

function normalizeOp(o: unknown): EditOp | null {
  const r = o as Record<string, unknown>;
  if (!r.op) return null;
  const str = (v: unknown) => (v == null ? undefined : String(v));
  const n = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? undefined : Number(v));
  return {
    op: String(r.op),
    from: str(r.from),
    to: str(r.to),
    layer: str(r.layer),
    color: str(r.color),
    find: str(r.find),
    replace: str(r.replace),
    text: str(r.text),
    x: n(r.x),
    y: n(r.y),
    w: n(r.w),
    h: n(r.h),
    dx: n(r.dx),
    dy: n(r.dy),
    factor: n(r.factor),
  };
}
