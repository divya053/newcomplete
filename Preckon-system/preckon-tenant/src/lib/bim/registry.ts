/**
 * BIM — the tool registry.
 *
 * The agent does not carry every capability in its system prompt. It searches
 * this registry for the two or three tools a task needs, then calls them. That
 * is the difference between a fixed command language and something that keeps
 * working at two hundred tools.
 *
 * A tool NEVER mutates. It returns COMMANDS, which Core applies through
 * commands.ts. The blueprint's §7 rule — "LLMs never directly write
 * authoritative geometry" — survives intact: the model chooses a tool, the tool
 * emits commands, the interpreter writes geometry.
 *
 * Tools carry a `module` and a `scope`. Scope is what makes user-authored tools
 * safe to mix with built-ins: a personal tool belongs to one author and is never
 * offered to anyone else.
 */

import type { Command } from "./commands";
import type { BimDocument, Discipline, Element } from "./model";
import { toVec2 } from "./model";

export type ToolScope = "global" | "personal";
export type ToolKind = "read" | "write";

export type ParamType = "string" | "number" | "boolean" | "selector" | "vec2" | "enum" | "string[]" | "object[]";

export interface ToolParam {
  name: string;
  type: ParamType;
  description: string;
  required?: boolean;
  default?: unknown;
  /** For type "enum". */
  options?: string[];
  /**
   * Other names a model plausibly reaches for.
   *
   * A model asked to draw a floor plate called the placement array `lines`
   * rather than `placements`. The parameter was then missing, the list became
   * `[undefined]`, and the tool cheerfully reported "Placing 1 wall(s)" —
   * a wall with no geometry. It then deleted it, tried again, and burned its
   * whole step budget probing the schema while the user watched one grey bar
   * appear and disappear.
   *
   * Accepting the near-miss costs nothing and turns a silent, confusing
   * degradation into the thing the user asked for. The canonical name is still
   * what the schema advertises.
   */
  aliases?: string[];
}

/**
 * Generic over document and command type.
 *
 * BIM Studio works on a BimDocument and emits Commands; the issued-drawing
 * editor works on a DxfModel and emits CadOps. The registry, the search, the
 * coercion and the agent loop are identical for both — only the tools differ —
 * so the types are parameters rather than two copies of this file. Defaults
 * keep every BIM call site reading exactly as it did.
 */
export interface ToolResult<Cmd = Command> {
  ok: boolean;
  /** One sentence for the user. Tools say what they did, not how. */
  summary: string;
  /** Shown as the JSON result card. Keep it small enough to read. */
  data?: unknown;
  /** Empty for read tools. Applied by Core, in order. */
  commands?: Cmd[];
  /** How many elements this touches — drives the confirmation gate. */
  affected?: number;
  /** Anything the tool guessed, so the agent can report it rather than hide it. */
  assumptions?: string[];
}

export interface ToolContext<Doc = BimDocument> {
  doc: Doc;
  /** Whose session this is — a personal tool only runs for its author. */
  userId?: string;
  /** The specialist driving, for discipline scoping. */
  discipline?: Discipline | "all";
}

export interface Tool<Doc = BimDocument, Cmd = Command> {
  /** snake_case, unique. This is what the model emits. */
  name: string;
  /** Display name for the tool card, e.g. "Tag Specific Elements". */
  label: string;
  module: string;
  scope: ToolScope;
  kind: ToolKind;
  /** Who may run a personal tool. Undefined for global tools. */
  owner?: string;
  description: string;
  params: ToolParam[];
  /** Extra search terms that do not appear in the name or description. */
  keywords?: string[];
  /** Disciplines this tool may act for. Undefined means any. */
  disciplines?: Discipline[];
  run: (ctx: ToolContext<Doc>, args: Record<string, any>) => ToolResult<Cmd>;
}

/** Above this many affected elements, the agent must confirm before applying. */
export const CONFIRM_THRESHOLD = 25;

// ── Registry ─────────────────────────────────────────────────────────────────

export class ToolRegistry<Doc = BimDocument, Cmd = Command> {
  private tools = new Map<string, Tool<Doc, Cmd>>();

  register(...tools: Tool<Doc, Cmd>[]): this {
    for (const t of tools) {
      if (this.tools.has(t.name)) throw new Error(`Duplicate tool name: ${t.name}`);
      this.tools.set(t.name, t);
    }
    return this;
  }

  /** Replace an existing tool — used when a user edits an authored tool. */
  upsert(tool: Tool<Doc, Cmd>): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string, userId?: string): Tool<Doc, Cmd> | undefined {
    const t = this.tools.get(name);
    if (!t) return undefined;
    return this.visible(t, userId) ? t : undefined;
  }

  /**
   * Look up a tool ignoring ownership. For diagnostics only — validation needs
   * to distinguish "no such tool" from "that tool is personal", and `get`
   * collapses both to undefined.
   */
  peek(name: string): Tool<Doc, Cmd> | undefined {
    return this.tools.get(name);
  }

  /** A personal tool is visible only to its author. */
  private visible(t: Tool<Doc, Cmd>, userId?: string): boolean {
    return t.scope === "global" || (!!t.owner && t.owner === userId);
  }

  all(userId?: string): Tool<Doc, Cmd>[] {
    return [...this.tools.values()].filter((t) => this.visible(t, userId));
  }

  modules(userId?: string): string[] {
    return [...new Set(this.all(userId).map((t) => t.module))].sort();
  }

  /**
   * Rank tools against a free-text task description.
   *
   * Deliberately a plain lexical score rather than embeddings: it runs in the
   * request with no model call, it is debuggable when a tool fails to surface,
   * and at this catalogue size recall is not the bottleneck. Revisit if the
   * registry passes a few hundred tools.
   */
  search(text: string, opts: { userId?: string; limit?: number; discipline?: Discipline | "all" } = {}): Tool<Doc, Cmd>[] {
    const { userId, limit = 8, discipline } = opts;
    // An empty search means "show me what there is". A search that is ALL
    // filler ("all of the in my") means the caller said nothing useful —
    // returning the whole catalogue there would dress noise up as relevance.
    if (!text.trim()) return this.all(userId).slice(0, limit);
    const terms = tokenise(text);
    if (!terms.length) return [];

    const scored = this.all(userId)
      .filter((t) => !discipline || discipline === "all" || !t.disciplines || t.disciplines.includes(discipline))
      .map((t) => ({ t, score: score(t, terms) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name));

    return scored.slice(0, limit).map((s) => s.t);
  }

  /** Compact catalogue for the model — name, what it does, and its parameters. */
  describe(tools: Tool<Doc, Cmd>[]): string {
    return tools
      .map((t) => {
        const ps = t.params
          .map((p) => `${p.name}:${p.type}${p.required ? "" : "?"}`)
          .join(", ");
        return `${t.name}(${ps}) [${t.kind}, module ${t.module}] — ${t.description}`;
      })
      .join("\n");
  }
}

// ── Search scoring ───────────────────────────────────────────────────────────

const STOP = new Set(["the", "a", "an", "all", "my", "in", "on", "of", "to", "for", "and", "with", "please", "make", "me", "i", "it", "is", "are", "this", "that", "by"]);

export function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function score(t: Tool<any, any>, terms: string[]): number {
  const name = tokenise(`${t.name} ${t.label}`);
  const keys = tokenise((t.keywords ?? []).join(" "));
  const desc = tokenise(`${t.description} ${t.module}`);
  let n = 0;
  for (const term of terms) {
    // A hit in the name is worth far more than one in prose — "tag" matching
    // tag_elements should beat a description that merely mentions tagging.
    if (name.some((w) => w === term)) n += 10;
    else if (keys.some((w) => w === term)) n += 6;
    else if (name.some((w) => w.startsWith(term) || term.startsWith(w))) n += 4;
    else if (desc.some((w) => w === term)) n += 2;
  }
  return n;
}

// ── Argument coercion ────────────────────────────────────────────────────────

/**
 * Coerce and validate arguments against a tool's declared parameters.
 *
 * Models emit "3" for a number and "true" for a boolean often enough that
 * rejecting them wastes a turn for no benefit. Coerce what is unambiguous,
 * reject what is not.
 */
export function coerceArgs(tool: Tool<any, any>, raw: Record<string, any> = {}): { args: Record<string, any>; errors: string[] } {
  const args: Record<string, any> = {};
  const errors: string[] = [];

  for (const p of tool.params) {
    let v = raw[p.name];

    // A near-miss name is worth accepting. See ToolParam.aliases.
    if (v === undefined || v === null || v === "") {
      for (const alt of p.aliases ?? []) {
        const got = raw[alt];
        if (got !== undefined && got !== null && got !== "") { v = got; break; }
      }
    }

    if (v === undefined || v === null || v === "") {
      if (p.default !== undefined) v = p.default;
      else if (p.required) {
        // Name what WAS sent. A model that used the wrong key can only correct
        // itself if the rejection says which key it should have used, and
        // listing what it actually passed is what makes that obvious.
        const sent = Object.keys(raw).filter((k) => !tool.params.some((q) => q.name === k));
        errors.push(
          `missing required parameter "${p.name}" (${p.type})` +
          (sent.length ? ` — you sent ${sent.map((k) => `"${k}"`).join(", ")}; use "${p.name}"` : ""),
        );
      }
      if (v === undefined || v === null || v === "") continue;
    }

    switch (p.type) {
      case "number": {
        const n = Number(v);
        if (!Number.isFinite(n)) errors.push(`"${p.name}" must be a number, got ${JSON.stringify(v)}`);
        else args[p.name] = n;
        break;
      }
      case "boolean":
        args[p.name] = v === true || v === "true" || v === 1 || v === "1";
        break;
      case "string":
        args[p.name] = String(v);
        break;
      case "string[]":
        args[p.name] = Array.isArray(v) ? v.map(String) : [String(v)];
        break;
      case "enum": {
        const s = String(v);
        if (p.options && !p.options.includes(s)) errors.push(`"${p.name}" must be one of ${p.options.join("|")}, got "${s}"`);
        else args[p.name] = s;
        break;
      }
      case "vec2": {
        // {x,y} or [x,y] — both are ordinary ways to write a coordinate.
        const pt = toVec2(v);
        if (!pt) errors.push(`"${p.name}" must be {x,y} or [x,y], got ${JSON.stringify(v)}`);
        else args[p.name] = pt;
        break;
      }
      case "selector":
        if (typeof v !== "object" || Array.isArray(v)) errors.push(`"${p.name}" must be a selector object`);
        else args[p.name] = v;
        break;
      case "object[]": {
        /* A genuine list parameter — a set of placements, a set of points.
           This used to be declared "selector", which rejects arrays outright,
           so every attempt to place more than one element at a time bounced
           and the assistant fell back to placing one. Be generous about the
           shape: a lone object means a list of one, and a model that hands
           back a JSON string still means the array inside it. */
        let items: unknown = v;
        if (typeof items === "string") {
          try { items = JSON.parse(items); } catch { /* reported below */ }
        }
        const list: unknown[] = Array.isArray(items) ? items : [items];
        const bad = list.findIndex((o) => typeof o !== "object" || o === null || Array.isArray(o));

        /* An empty array is the model saying "I know the parameter but not what
           goes in it". Answering with the parameter name again teaches it
           nothing — it already knew that much — so the rejection carries a
           worked example instead. Every rejection in this loop costs a step,
           and a step that ends where it began is how a run exhausts itself
           without drawing anything. */
        if (!list.length) {
          errors.push(
            `"${p.name}" is empty. It needs at least one object — for walls, ` +
            `[{"start":{"x":0,"y":0},"end":{"x":24000,"y":0}}]. Coordinates are millimetres.`,
          );
        } else if (bad >= 0) {
          errors.push(`"${p.name}"[${bad}] must be an object, got ${JSON.stringify(list[bad])}`);
        } else args[p.name] = list;
        break;
      }
    }
  }

  return { args, errors };
}

/** Elements a write tool would touch, for the gate and the audit line. */
export const affectedIds = (els: Element[]): string[] => els.map((e) => e.id);
