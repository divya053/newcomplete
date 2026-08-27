// A gate must never wait for a confirmation that cannot arrive.
//
// ── THE BUG THIS PINS ────────────────────────────────────────────────────────
//
// gateResolved decided whether a paused run could continue:
//
//   return !pendingRemains && (hasConfirmed || allowEmpty);
//
// `allowEmpty` is passed true only by autopilot. On a MANUAL run it defaults to
// false, so a producer step that legitimately emitted nothing left:
//
//   pendingRemains = false   (nothing was proposed)
//   hasConfirmed   = false   (so nothing could be confirmed)
//   → false, forever.
//
// The gate stayed at awaiting_review permanently. And because nothing was
// pending, the review panel had nothing to show either — the stage read
// "paused — waiting on you" above a panel reading "0 records to confirm", with
// no control anywhere that could clear it. The only escape was cancelling the
// run.
//
// It was reported as "it says paused, I clicked, nothing works", which is
// exactly right: there was nothing to click.
//
// The comment beside the allowEmpty branch already described this failure —
// "a gate over a producer that legitimately emitted no artifacts must not stall
// the automatic pursuit" — so the hole was known. It was closed for autopilot
// and left open for the manual path, which is the one a person actually watches.
//
// This reads the source rather than the database, so it runs in CI with no
// MySQL, like the tenancy guard beside it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "..", "src", "lib", "runtime.ts"), "utf8");

/** The body of gateResolved, from its signature to its return. */
function gateResolvedBody(): string {
  const start = SRC.indexOf("async function gateResolved");
  expect(start, "gateResolved not found — this test is pinned to it by name").toBeGreaterThan(-1);
  const end = SRC.indexOf("\n}", start);
  return SRC.slice(start, end);
}

/**
 * The DECIDING expression, not merely the body.
 *
 * The first version of this test searched the whole function for the name of
 * the new term. It passed against the unfixed code, because reverting only the
 * `return` left the variable declared above it — a test that goes green on the
 * bug it exists to catch. The condition is what matters, so read the condition.
 */
function decidingReturn(): string {
  const body = gateResolvedBody();
  const m = body.match(/return\s+([^;]+);\s*$/);
  expect(m, "gateResolved does not end in a single return expression").toBeTruthy();
  return m![1];
}

describe("a gate cannot deadlock on a producer that emitted nothing", () => {
  const body = gateResolvedBody();

  it("still finds the function it is pinned to, so a pass is not vacuous", () => {
    expect(body).toContain("pendingRemains");
    expect(body).toContain("hasConfirmed");
  });

  it("resolves when the run produced no artifacts of the gate types at all", () => {
    // The specific escape hatch. Without a term like this, the manual path has
    // no way out: nothing pending means nothing to confirm means nothing that
    // can ever set hasConfirmed.
    expect(
      decidingReturn(),
      "\n\nThe deciding expression has no term covering 'the producer emitted\n" +
        "nothing'. On a manual run that is a permanent deadlock: the gate waits\n" +
        "for a confirmation, and there is nothing on screen to confirm.\n",
    ).toMatch(/anyAtAll|noneAtAll|!\s*any\b/);
  });

  it("does NOT reach that conclusion through allowEmpty alone", () => {
    /* allowEmpty would also open the gate when artifacts existed and a person
       rejected every one. That is a human decision about real output, and it is
       not the same as having nothing to decide — so the manual path must not be
       fixed by simply passing allowEmpty from resumeGates. */
    const resumeStart = SRC.indexOf("export async function resumeGates");
    const resumeBody = SRC.slice(resumeStart, SRC.indexOf("\n}", resumeStart));
    expect(
      resumeBody,
      "\n\nresumeGates passes allowEmpty. That opens the gate when every artifact\n" +
        "was REJECTED as well as when none existed. Use the narrower term.\n",
    ).not.toMatch(/gateResolved\([^)]*,\s*true\s*\)/);
  });

  it("still holds the gate while anything is pending", () => {
    // The control has to survive the fix: if a proposal is waiting for a person,
    // the run stays paused no matter what else is true.
    expect(body).toMatch(/!\s*pendingRemains\s*&&/);
  });
});
