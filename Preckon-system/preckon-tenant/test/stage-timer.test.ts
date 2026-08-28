// A stage says what it is doing and since when.
//
// ── WHAT THIS REPLACED ───────────────────────────────────────────────────────
//
// The module header carried one chip, rendered only while a run existed:
//
//   {active && <span className="chip running">
//      {active.status === "awaiting_review" ? "paused — waiting on you" : "running"}
//    </span>}
//
// Two failures came out of that. It said "paused — waiting on you" above panels
// offering nothing to confirm — the parked-gate state, 39 of them on production.
// And `active` only matches running/awaiting_review, so the instant a run
// completed the chip vanished: someone who pressed Run watched a chip for a
// while and was then shown nothing at all, with a finished run and a run that
// never started looking identical.
//
// Neither is a styling problem. What was missing was elapsed time.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fmtClock, fmtTook, epoch } from "@/lib/elapsed";

const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

describe("the running clock", () => {
  it("counts from zero in m:ss", () => {
    expect(fmtClock(0)).toBe("0:00");
    expect(fmtClock(9_000)).toBe("0:09");
    expect(fmtClock(84_000)).toBe("1:24");
  });

  it("keeps a constant width as seconds roll over", () => {
    // The whole reason for zero-padding: 1:09 → 1:10 must not change the
    // string's length, or every chip beside it shifts once a second.
    const widths = new Set([9, 10, 59].map((s) => fmtClock(60_000 + s * 1000).length));
    expect(widths.size).toBe(1);
  });

  it("grows to h:mm:ss past the hour rather than showing 61:00", () => {
    expect(fmtClock(3_600_000)).toBe("1:00:00");
    expect(fmtClock(3_723_000)).toBe("1:02:03");
  });

  it("never counts backwards", () => {
    // Clock skew between the server's started_at and the browser's Date.now()
    // can make elapsed negative for a second or two after a run starts.
    expect(fmtClock(-5_000)).toBe("0:00");
  });
});

describe("a finished duration reads as prose", () => {
  it("uses units, not a clock face", () => {
    expect(fmtTook(48_000)).toBe("48s");
    expect(fmtTook(134_000)).toBe("2m 14s");
  });

  it("drops seconds past the hour, where they are noise", () => {
    expect(fmtTook(3_780_000)).toBe("1h 3m");
  });
});

describe("timestamps", () => {
  it("reads the UTC ISO the API returns", () => {
    expect(epoch("2026-08-29T10:00:00.000Z")).toBe(Date.parse("2026-08-29T10:00:00.000Z"));
  });

  it("returns null for absent or unparseable values rather than NaN", () => {
    // NaN would propagate into the clock and render "NaN:NaN".
    for (const v of [null, undefined, "", "not a date"]) expect(epoch(v)).toBeNull();
  });
});

describe("the stage no longer tells anyone it is waiting on them", () => {
  it("no locale still carries the paused string", () => {
    for (const f of ["en", "ar", "fr"]) {
      expect(read("src", "lib", "i18n", `${f}.ts`), `${f} still defines stage.paused`)
        .not.toMatch(/"stage\.paused"\s*:/);
    }
  });

  it("the header renders a status for a settled run, not only a live one", () => {
    const c = read("src", "lib", "surfaces", "common.tsx");
    // The old chip was gated on `active`, which excludes completed and failed.
    expect(c).toMatch(/<StageStatus/);
    expect(c).toMatch(/stage\.completedIn/);
    expect(c).toMatch(/stage\.failedAfter/);
  });

  it("a gate with nothing pending is named finished, not paused", () => {
    expect(read("src", "lib", "surfaces", "common.tsx")).toMatch(/stage\.nothingToReview/);
  });
});

describe("the data the header needs actually arrives", () => {
  it("the runs list carries step progress", () => {
    // Without these the header can only say 'running' — equally true at two
    // seconds and at twenty minutes.
    const r = read("src", "app", "api", "v1", "projects", "[pid]", "runs", "route.ts");
    expect(r).toMatch(/steps_total/);
    expect(r).toMatch(/steps_done/);
  });

  it("the workspace polls faster while a run is live", () => {
    const l = read("src", "app", "(app)", "projects", "[pid]", "layout.tsx");
    expect(l).toMatch(/refreshMs:\s*liveRun\s*\?/);
  });

  it("artifacts are re-read the moment a run stops", () => {
    // Otherwise the header announces "completed in 2m 14s" over a panel still
    // showing what was there before the run.
    expect(read("src", "app", "(app)", "projects", "[pid]", "layout.tsx"))
      .toMatch(/wasLive\.current && !anyLive/);
  });
});

describe("a cancelled run is not reported as a success", () => {
  it("has its own branch above the completed one", () => {
    // Re-run cancels a parked run before starting a new one, so a cancelled
    // run is the newest run of its module for as long as the new one takes to
    // appear. Falling through to the completed branch had the stage claim
    // "completed in 2m 14s" for a run that was stopped and produced nothing.
    const c = readFileSync(join(__dirname, "..", "src", "lib", "surfaces", "common.tsx"), "utf8");
    const body = c.slice(c.indexOf("export function StageStatus"));
    expect(body.indexOf('run.status === "cancelled"')).toBeGreaterThan(-1);
    expect(body.indexOf('run.status === "cancelled"')).toBeLessThan(
      body.indexOf('const failed = run.status === "failed"'),
    );
  });
});
