import { describe, it, expect } from "vitest";
import { coerceArgs } from "../src/lib/bim/registry";
import { BUILTIN_TOOLS } from "../src/lib/bim/tools";

const place = BUILTIN_TOOLS.find((t: any) => t.name === "place_elements")!;

describe("place_elements accepts a whole floor plate in one call", () => {
  it("takes an array of placements (the case that used to be rejected)", () => {
    const placements = Array.from({ length: 8 }, (_, i) => ({
      start: { x: 0, y: i * 3 }, end: { x: 24, y: i * 3 },
    }));
    const { args, errors } = coerceArgs(place, { category: "wall", placements });
    expect(errors).toEqual([]);
    expect(args.placements).toHaveLength(8);
  });

  it("still takes a lone object as a list of one", () => {
    const { args, errors } = coerceArgs(place, {
      category: "wall", placements: { start: { x: 0, y: 0 }, end: { x: 24, y: 0 } },
    });
    expect(errors).toEqual([]);
    expect(args.placements).toHaveLength(1);
  });

  it("recovers an array handed back as a JSON string", () => {
    const { args, errors } = coerceArgs(place, {
      category: "wall",
      placements: JSON.stringify([{ start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }]),
    });
    expect(errors).toEqual([]);
    expect(args.placements).toHaveLength(1);
  });

  it("rejects a list of non-objects with a usable message", () => {
    const { errors } = coerceArgs(place, { category: "wall", placements: [1, 2] });
    expect(errors[0]).toMatch(/must be an object/);
  });
});
