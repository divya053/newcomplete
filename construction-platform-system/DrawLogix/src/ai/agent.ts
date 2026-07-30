import Anthropic from "@anthropic-ai/sdk";
import type { ScheduleRow } from "@/db/schema";

/**
 * The DrawLogix AI copilot — an ArchiLabs-style architectural agent. Claude (Sonnet
 * 4.6) interprets a natural-language instruction and calls tools that edit the
 * building's room programme; we apply each tool to an in-memory schedule and loop
 * until the model is done (the standard tool_use → tool_result manual loop).
 */
const MODEL = "claude-sonnet-4-6";

type Room = { room: string; areaSqm: number };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "generate_layout",
    description:
      "Replace the ENTIRE room programme with a new set of rooms. Use this when the user asks to design a building or space from a brief (e.g. 'design a 3-surgery dental clinic'). Choose realistic room sizes in m² for the building type.",
    input_schema: {
      type: "object",
      properties: {
        rooms: {
          type: "array",
          description: "The full list of rooms for the building.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Room name, e.g. 'Reception'." },
              areaSqm: { type: "number", description: "Floor area in square metres." },
            },
            required: ["name", "areaSqm"],
          },
        },
      },
      required: ["rooms"],
    },
  },
  {
    name: "add_room",
    description: "Add one room to the programme.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, areaSqm: { type: "number", description: "Area in m² (estimate if not given)." } },
      required: ["name"],
    },
  },
  {
    name: "remove_room",
    description: "Remove a room by name (partial match).",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "resize_room",
    description: "Set a room's area in m².",
    input_schema: { type: "object", properties: { name: { type: "string" }, areaSqm: { type: "number" } }, required: ["name", "areaSqm"] },
  },
  {
    name: "rename_room",
    description: "Rename a room.",
    input_schema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
  },
];

function apply(tool: string, input: Record<string, unknown>, rooms: Room[]): { rooms: Room[]; note: string } {
  const num = (v: unknown, d: number) => Math.max(1, Math.round(Number(v) || d));
  const str = (v: unknown) => String(v ?? "").trim();
  switch (tool) {
    case "generate_layout": {
      const list = Array.isArray(input.rooms) ? (input.rooms as Record<string, unknown>[]) : [];
      const next = list.map((r) => ({ room: str(r.name) || "Room", areaSqm: num(r.areaSqm, 12) }));
      return { rooms: next, note: `generated ${next.length} rooms` };
    }
    case "add_room": {
      const room = str(input.name) || "Room";
      return { rooms: [...rooms, { room, areaSqm: num(input.areaSqm, 12) }], note: `added ${room}` };
    }
    case "remove_room": {
      const n = str(input.name).toLowerCase();
      const next = rooms.filter((r) => !r.room.toLowerCase().includes(n));
      return { rooms: next, note: next.length === rooms.length ? `no room matching "${input.name}"` : `removed ${input.name}` };
    }
    case "resize_room": {
      const n = str(input.name).toLowerCase();
      const area = num(input.areaSqm, 10);
      let found = false;
      const next = rooms.map((r) => (r.room.toLowerCase().includes(n) ? ((found = true), { ...r, areaSqm: area }) : r));
      return { rooms: next, note: found ? `resized ${input.name} to ${area} m²` : `no room matching "${input.name}"` };
    }
    case "rename_room": {
      const from = str(input.from).toLowerCase();
      const to = str(input.to) || "Room";
      let found = false;
      const next = rooms.map((r) => (r.room.toLowerCase().includes(from) ? ((found = true), { ...r, room: to }) : r));
      return { rooms: next, note: found ? `renamed to ${to}` : `no room matching "${input.from}"` };
    }
    default:
      return { rooms, note: `unknown tool ${tool}` };
  }
}

function reref(rooms: Room[]): ScheduleRow[] {
  return rooms.map((r, i) => ({ ref: `A-${String(i + 1).padStart(2, "0")}`, room: r.room, areaSqm: r.areaSqm }));
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ── Document understanding → design extraction ────────────────────────────────
const CATEGORIES = ["space", "constraint", "assumption", "exclusion", "clarification"] as const;

export interface ExtractedDesign {
  requirements: { ref: string; category: string; title: string; detail?: string }[];
  rooms: { name: string; areaSqm: number; requirementRef?: string; kind?: string; connectsTo?: string[]; count?: number; ensuiteSqm?: number }[];
  footprint?: { widthM: number; lengthM: number };
}

const SUBMIT_DESIGN: Anthropic.Tool = {
  name: "submit_design",
  description: "Submit the structured requirements and the room programme extracted from the project documents.",
  input_schema: {
    type: "object",
    properties: {
      footprint: {
        type: "object",
        description: "Overall building footprint in metres IF the documents state it (e.g. '15 m × 56 m'). Omit if not given.",
        properties: { widthM: { type: "number" }, lengthM: { type: "number" } },
      },
      requirements: {
        type: "array",
        description: "The explicit and implicit requirements found in the documents, each with a stable ref (R-001, R-002, …).",
        items: {
          type: "object",
          properties: {
            ref: { type: "string", description: "Stable id like R-001." },
            category: { type: "string", enum: [...CATEGORIES] },
            title: { type: "string", description: "Short requirement statement." },
            detail: { type: "string", description: "Optional fuller text / source quote." },
          },
          required: ["ref", "category", "title"],
        },
      },
      rooms: {
        type: "array",
        description: "The room programme that satisfies the requirements — spaces with realistic floor areas in m².",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Base name. For a repeated room give the singular (e.g. 'Dormitory Room'), not 'Dormitory Rooms'." },
            areaSqm: { type: "number", description: "Floor area of ONE room in square metres (not the total for all copies)." },
            count: { type: "number", description: "How many identical copies of this room (e.g. 20 dormitories). Default 1." },
            ensuiteSqm: { type: "number", description: "If EACH copy of this room has its own private en-suite bathroom, the en-suite area in m². Omit if none." },
            kind: { type: "string", enum: ["habitable", "wet", "service", "circulation"], description: "habitable=rooms with daylight (dorms/offices); wet=WC/bath; service=store/plant/IT/mech/laundry; circulation=corridor/vestibule." },
            connectsTo: { type: "array", items: { type: "string" }, description: "Names of rooms this space should be adjacent to." },
            requirementRef: { type: "string", description: "The R-xxx requirement this space satisfies (for traceability)." },
          },
          required: ["name", "areaSqm"],
        },
      },
    },
    required: ["requirements", "rooms"],
  },
};

/**
 * Read the project's documents (SOW / interview / spec) with Claude and extract a
 * structured design: categorised requirements + a room programme, each space traced
 * to the requirement it satisfies. The model is FORCED to answer via submit_design,
 * so we always get clean structured data (no free-text parsing).
 */
export async function extractDesignFromDocuments(
  docs: { name: string; docType: string; content: string }[],
): Promise<ExtractedDesign> {
  const client = new Anthropic();

  // Documents can be very large PDFs — send generously (Sonnet has a big context) and
  // dedupe identical uploads, so the room/accommodation schedule isn't cut off.
  const PER_DOC = 200_000;
  const TOTAL = 400_000;
  const seen = new Set<string>();
  const parts: string[] = [];
  let used = 0;
  for (const d of docs) {
    const content = (d.content ?? "").trim();
    if (!content) continue;
    const key = content.slice(0, 200);
    if (seen.has(key)) continue; // skip duplicate uploads
    seen.add(key);
    if (used >= TOTAL) break;
    const slice = content.slice(0, Math.min(PER_DOC, TOTAL - used));
    parts.push(`## ${d.name} (${d.docType})\n${slice}`);
    used += slice.length;
  }
  const body = parts.join("\n\n");
  if (body.trim().length < 30) {
    throw new Error("The documents have no readable text (e.g. a scanned PDF) — paste the brief text instead.");
  }

  const system =
    "You are an expert architect. You are given a construction project's source documents — a Scope of Work, interview notes, and/or specifications. They may be LONG (full design packages); read them and FIND the accommodation / room / area schedule and the functional requirements. Produce: (1) the REQUIREMENTS, as a structured list with stable refs R-001, R-002, …, each categorised (space/constraint/assumption/exclusion/clarification); and (2) a ROOM PROGRAMME grounded in the documents. Rules for the programme: " +
    "• If the documents state an overall building FOOTPRINT (e.g. '15 m × 56 m'), set `footprint`. " +
    "• For a room that REPEATS (e.g. 20 dormitory rooms), give ONE entry with `count` set and `areaSqm` = the area of a SINGLE room (do not multiply). " +
    "• If each copy has its own private bathroom, set `ensuiteSqm` to the en-suite area. " +
    "• Set each room's `kind`; mark entrance vestibules/lobbies as kind 'circulation'. " +
    "• Use realistic m² areas; if the docs give a schedule, USE those rooms and areas. Every space should trace to a requirement ref. Respond ONLY by calling submit_design.";

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system,
    tools: [SUBMIT_DESIGN],
    tool_choice: { type: "tool", name: "submit_design" },
    messages: [{ role: "user", content: body }],
  });

  const tu = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const input = (tu?.input ?? {}) as { requirements?: unknown[]; rooms?: unknown[]; footprint?: { widthM?: unknown; lengthM?: unknown } };

  const fp = input.footprint;
  const footprint =
    fp && Number(fp.widthM) > 0 && Number(fp.lengthM) > 0 ? { widthM: Number(fp.widthM), lengthM: Number(fp.lengthM) } : undefined;

  const requirements = (Array.isArray(input.requirements) ? input.requirements : [])
    .slice(0, 60)
    .map((r, i) => {
      const o = r as Record<string, unknown>;
      const category = String(o.category ?? "space");
      return {
        ref: String(o.ref ?? `R-${String(i + 1).padStart(3, "0")}`),
        category: (CATEGORIES as readonly string[]).includes(category) ? category : "clarification",
        title: String(o.title ?? "Requirement").slice(0, 480),
        detail: o.detail ? String(o.detail).slice(0, 2000) : undefined,
      };
    });

  const rooms = (Array.isArray(input.rooms) ? input.rooms : [])
    .slice(0, 40)
    .map((r) => {
      const o = r as Record<string, unknown>;
      const count = Math.round(Number(o.count) || 1);
      const ensuite = Number(o.ensuiteSqm) || 0;
      return {
        name: String(o.name ?? "Room").slice(0, 120) || "Room",
        areaSqm: Math.max(1, Math.round(Number(o.areaSqm) || 12)),
        count: count > 1 ? Math.min(80, count) : undefined,
        ensuiteSqm: ensuite > 0 ? Math.max(2, Math.round(ensuite)) : undefined,
        kind: o.kind ? String(o.kind) : undefined,
        connectsTo: Array.isArray(o.connectsTo) ? (o.connectsTo as unknown[]).map(String).slice(0, 12) : undefined,
        requirementRef: o.requirementRef ? String(o.requirementRef) : undefined,
      };
    });

  return { requirements, rooms, footprint };
}

export async function runArchitectAgent(
  current: ScheduleRow[],
  userText: string,
): Promise<{ schedule: ScheduleRow[]; reply: string }> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  let rooms: Room[] = current.map((r) => ({ room: r.room, areaSqm: r.areaSqm }));
  const notes: string[] = [];

  const system =
    "You are DrawLogix, an AI architectural copilot. You design and edit a building's room programme (an area schedule: rooms with sizes in m²). Use the tools to satisfy the user's request — add, remove, resize, or rename rooms, or generate a whole layout from a brief. Pick realistic room sizes for the building type. Keep edits minimal and targeted unless asked to redesign. After your changes, reply in one or two short sentences describing what you did. " +
    `Current programme: ${rooms.length ? rooms.map((r) => `${r.room} (${r.areaSqm} m²)`).join(", ") : "(empty)"}.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];

  for (let step = 0; step < 6; step++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 1024, system, tools: TOOLS, messages });

    if (res.stop_reason === "tool_use") {
      const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const out = apply(tu.name, (tu.input ?? {}) as Record<string, unknown>, rooms);
        rooms = out.rooms;
        notes.push(out.note);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out.note });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    return { schedule: reref(rooms), reply: text || (notes.length ? `Done — ${notes.join("; ")}.` : "No change made.") };
  }

  return { schedule: reref(rooms), reply: notes.length ? `Done — ${notes.join("; ")}.` : "Reached the step limit." };
}
