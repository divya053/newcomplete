// Placing elements — the bug that made BIM Studio look broken.
//
// Asked to draw a school block, the assistant placed one wall, deleted it,
// placed another, and narrated "Testing 'lines' array placement schema." The
// user saw a single grey bar appear and disappear.
//
// Cause: the model called the placement array `lines`; the parameter is
// `placements`. It was therefore missing, `[a.placements]` became `[undefined]`,
// and the tool reported "Placing 1 wall(s)" — a wall with no geometry. Nothing
// told the model it had the name wrong, so it probed until its steps ran out.
//
// Two rules come out of that: accept the near-miss name, and never accept a
// placement with no geometry.

import { describe, it, expect } from "vitest";
import { coerceArgs } from "@/lib/bim/registry";
import { BUILTIN_TOOLS } from "@/lib/bim/tools";
import { emptyDocument } from "@/lib/bim/model";

const place = BUILTIN_TOOLS.find((t) => t.name === "place_elements")!;
const ctx = { doc: emptyDocument(), userId: "u1", discipline: "all" } as any;

const wall = (x1: number, y1: number, x2: number, y2: number) =>
  ({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 } });

describe("the parameter name the model actually used", () => {
  it("accepts `lines` as the placement array", () => {
    /* The exact call from the failing session. */
    const { args, errors } = coerceArgs(place, {
      category: "wall",
      lines: [wall(0, 0, 24000, 0), wall(24000, 0, 24000, 10000)],
    });
    expect(errors).toEqual([]);
    expect(args.placements).toHaveLength(2);
  });

  it("accepts the other names a model reaches for", () => {
    for (const key of ["elements", "items", "segments", "walls", "positions"]) {
      const { args, errors } = coerceArgs(place, { category: "wall", [key]: [wall(0, 0, 1000, 0)] });
      expect(errors, key).toEqual([]);
      expect(args.placements, key).toHaveLength(1);
    }
  });

  it("still prefers the canonical name when both are present", () => {
    const { args } = coerceArgs(place, {
      category: "wall",
      placements: [wall(0, 0, 1000, 0)],
      lines: [wall(0, 0, 2000, 0), wall(0, 0, 3000, 0)],
    });
    expect(args.placements).toHaveLength(1);
  });

  it("names what was sent when the parameter is genuinely missing", () => {
    /* A model can only correct itself if the rejection says which key it should
       have used. "missing required parameter" alone leaves it guessing, which
       is what the probing loop was. */
    const { errors } = coerceArgs(place, { category: "wall", wibble: [wall(0, 0, 1, 1)] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/"wibble"/);
    expect(errors[0]).toMatch(/use "placements"/);
  });
});

describe("a placement must carry its geometry", () => {
  it("refuses a linear placement with no start or end", () => {
    /* The actual failure: `[undefined]` became one wall with no extent. It
       draws as a stray bar, measures as nothing, and signals nothing. */
    const r = place.run(ctx, { category: "wall", placements: [{}] } as any);
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/missing the geometry/i);
    expect(r.summary).toMatch(/start:\{x,y\} and end:\{x,y\}/);
  });

  it("says which placement in the array was wrong", () => {
    const r = place.run(ctx, {
      category: "wall",
      placements: [wall(0, 0, 1000, 0), { start: { x: 0, y: 0 } }],
    } as any);
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/placements\[1\]/);
  });

  it("refuses a point item with no position", () => {
    const r = place.run(ctx, { category: "column", placements: [{ at: null }] } as any);
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/at:\{x,y\}/);
  });

  it("refuses non-numeric coordinates", () => {
    const r = place.run(ctx, {
      category: "wall",
      placements: [{ start: { x: "left", y: 0 }, end: { x: 1000, y: 0 } }],
    } as any);
    expect(r.ok).toBe(false);
  });

  it("places a whole set in one call when the geometry is there", () => {
    // What the school-block prompt should have produced on the first attempt.
    const perimeter = [
      wall(0, 0, 24000, 0),
      wall(24000, 0, 24000, 10000),
      wall(24000, 10000, 0, 10000),
      wall(0, 10000, 0, 0),
    ];
    const r = place.run(ctx, { category: "wall", placements: perimeter } as any);
    expect(r.ok).toBe(true);
    expect(r.affected).toBe(4);
    expect(r.commands).toHaveLength(4);
    expect(r.summary).toMatch(/placing 4 wall/i);
  });

  it("accepts a lone object as a list of one", () => {
    const r = place.run(ctx, { category: "wall", placements: wall(0, 0, 5000, 0) } as any);
    expect(r.ok).toBe(true);
    expect(r.affected).toBe(1);
  });
});
