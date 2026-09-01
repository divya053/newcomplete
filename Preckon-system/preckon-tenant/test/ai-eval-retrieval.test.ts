// The two AI measures that need no model, and were therefore never taken.
//
// test/ai-eval.test.ts states the gap it leaves: "Extraction accuracy, BOQ
// completeness and citation fidelity need real model calls against fixture
// projects and belong in a scheduled run with an API key."
//
// True of extraction. Not true of these two, and treating it as true is why
// neither was measured:
//
//   RETRIEVAL is a pure function of an index and a question. No model decides
//   what comes back, so it is exactly scoreable on every commit.
//
//   CITATION FIDELITY is checkable after the fact. A model can claim anything;
//   whether the passage it cited contains what it claimed is arithmetic over
//   strings.
//
// Half the tests below feed the scorers WRONG answers. A scorer that cannot
// fail is a green tick nobody earned.

import { describe, it, expect } from "vitest";
import {
  scoreRetrieval, scoreCitations, verifyCitation,
  formatRetrieval, formatCitations,
  type RetrievalCase, type ScorableHit,
} from "@/lib/ai/eval/retrieval";

const CASES: RetrievalCase[] = [
  { id: "R1", question: "what concrete strength is specified", expect: { documentNumber: "SPEC-S-001", page: 1 } },
  { id: "R2", question: "fire rating of the plant room partition", expect: { documentNumber: "SPEC-A-002", page: 2 } },
  { id: "R3", question: "A-201", expect: { documentNumber: "DWG-A-201" }, note: "identifier-only; FULLTEXT drops short tokens" },
];

const hit = (documentNumber: string, page?: number): ScorableHit => ({ documentNumber, page, text: "" });

describe("retrieval scoring", () => {
  it("scores a perfect run as perfect", () => {
    const r = scoreRetrieval(CASES, [
      [hit("SPEC-S-001", 1)],
      [hit("SPEC-A-002", 2)],
      [hit("DWG-A-201", 3)],
    ]);
    expect(r.precisionAt1).toBe(1);
    expect(r.mrr).toBe(1);
    expect(r.misses).toEqual([]);
  });

  it("scores a run that finds nothing as zero", () => {
    // The test that proves the scorer is capable of failing at all.
    const r = scoreRetrieval(CASES, [[hit("OTHER-001", 9)], [], [hit("WRONG-002")]]);
    expect(r.precisionAt1).toBe(0);
    expect(r.recallAt5).toBe(0);
    expect(r.mrr).toBe(0);
    expect(r.misses).toHaveLength(3);
  });

  it("rewards being near the top, not merely present", () => {
    /* The distinction that matters in practice: a passage ranked 4th is in the
       packed context and is not what a one-shot answer reads first. */
    const top = scoreRetrieval([CASES[0]], [[hit("SPEC-S-001", 1), hit("X")]]);
    const deep = scoreRetrieval([CASES[0]], [[hit("X"), hit("Y"), hit("Z"), hit("SPEC-S-001", 1)]]);
    expect(top.mrr).toBe(1);
    expect(deep.mrr).toBe(0.25);
    expect(deep.recallAt5).toBe(1);
    expect(deep.precisionAt1).toBe(0);
  });

  it("a case naming only a document passes on any of its pages", () => {
    // Right for a question the whole document answers; a page number would be
    // over-specifying the expectation and would fail on a correct answer.
    const r = scoreRetrieval([CASES[2]], [[hit("DWG-A-201", 7)]]);
    expect(r.found ?? r.outcomes[0].found).toBeTruthy();
  });

  it("a case naming a page does NOT pass on the wrong page", () => {
    const r = scoreRetrieval([CASES[0]], [[hit("SPEC-S-001", 5)]]);
    expect(r.outcomes[0].found).toBe(false);
  });

  it("names every miss in the report, so a number leads somewhere", () => {
    const out = formatRetrieval(scoreRetrieval(CASES, [[], [], []]));
    expect(out).toMatch(/MISS {2}R1/);
    expect(out).toMatch(/identifier-only/);
  });
});

describe("citation fidelity", () => {
  const passage =
    "All structural concrete shall achieve a minimum characteristic cylinder strength of 40 MPa at 28 days.";

  it("accepts a claim the passage supports, paraphrased", () => {
    const v = verifyCitation({ text: "concrete strength 40 MPa at 28 days", citedText: passage });
    expect(v.supported).toBe(true);
  });

  it("rejects a claim whose NUMBER is not in the passage", () => {
    /* The failure this exists for. "30 MPa" cited to a clause saying 40 is a
       confident answer attached to a real document that does not say it -
       exactly what a reviewer would wave through, because the citation is
       there and the document is genuine. */
    const v = verifyCitation({ text: "concrete strength is 30 MPa", citedText: passage });
    expect(v.supported).toBe(false);
    expect(v.contradicted).toBe(true);
    expect(v.why).toMatch(/30/);
  });

  it("treats an uncited claim as unsupported, separately from a wrong one", () => {
    const v = verifyCitation({ text: "concrete strength is 40 MPa" });
    expect(v.uncited).toBe(true);
    expect(v.contradicted).toBe(false);
    expect(v.supported).toBe(false);
  });

  it("rejects a citation to an unrelated passage that happens to share a number", () => {
    const v = verifyCitation({
      text: "the partition achieves 40 minutes fire resistance",
      citedText: "Provide 40 linear metres of skirting to the corridor.",
    });
    expect(v.supported).toBe(false);
  });

  it("scores a mixed set and separates the two failure kinds", () => {
    const s = scoreCitations([
      { text: "40 MPa at 28 days", citedText: passage },
      { text: "30 MPa at 28 days", citedText: passage },
      { text: "the slab is 200mm thick" },
    ]);
    expect(s.claims).toBe(3);
    expect(s.supported).toBe(1);
    expect(s.contradicted).toBe(1);
    expect(s.uncited).toBe(1);
    expect(s.fidelity).toBeCloseTo(0.3333, 3);
  });

  it("explains each failure rather than only counting it", () => {
    const out = formatCitations(scoreCitations([{ text: "30 MPa", citedText: passage }]));
    expect(out).toMatch(/FAIL/);
    expect(out).toMatch(/does not contain/);
  });
});
