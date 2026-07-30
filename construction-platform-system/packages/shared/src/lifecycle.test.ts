import { describe, expect, it } from "vitest";
import { canTransition } from "./lifecycle";
import { ALL_PERMISSIONS, isPermission } from "./permissions";

describe("lifecycle", () => {
  it("allows a forward transition", () => {
    expect(canTransition("under_review", "approved")).toBe(true);
  });
  it("rejects an illegal transition", () => {
    expect(canTransition("published", "draft")).toBe(false);
  });
});

describe("permissions catalog", () => {
  it("recognizes a catalog permission and rejects an ad-hoc string", () => {
    expect(isPermission(ALL_PERMISSIONS[0] as string)).toBe(true);
    expect(isPermission("totally:madeup")).toBe(false);
  });
});
