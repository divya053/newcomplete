// Scoring what retrieval brought back, and whether an answer's citations hold.
//
// ── WHY THESE TWO ────────────────────────────────────────────────────────────
//
// test/ai-eval.test.ts says plainly what it does not cover: "Extraction
// accuracy, BOQ completeness and citation fidelity need real model calls
// against fixture projects and belong in a scheduled run with an API key."
//
// That is true of extraction. It is NOT true of the two measures here, and
// treating them as if it were is why neither was measured.
//
//   RETRIEVAL is a pure function of an index and a question. No model is
//   involved in deciding what comes back, so the answer is exactly scoreable
//   and runnable on every commit.
//
//   CITATION FIDELITY is checkable after the fact. A model can claim anything;
//   whether the passage it cited actually contains what it claimed is
//   arithmetic over strings. This catches the specific failure that matters
//   most on a construction project — a confident answer attached to a real
//   document that does not say it — which no amount of tool-selection scoring
//   would notice.
//
// Both scorers are PURE: they take results and return a number. The runner does
// the searching, so these are testable with no database and no API key.

/** One thing we expect the index to be able to find. */
export interface RetrievalCase {
  id: string;
  question: string;
  /**
   * Where the answer lives. A case is satisfied when a hit matches every field
   * that is specified — a case naming only the document passes on any page of
   * it, which is right for a question the whole document answers.
   */
  expect: { documentNumber: string; page?: number };
  /** Why this case exists. Printed on failure, where it is worth having. */
  note?: string;
}

/** The shape a hit has to have for scoring. Deliberately less than SearchHit. */
export interface ScorableHit {
  documentNumber?: string;
  page?: number;
  text?: string;
}

export interface CaseOutcome {
  id: string;
  question: string;
  /** 1-based position of the first correct hit, or 0 when there was none. */
  rank: number;
  found: boolean;
  note?: string;
}

export interface RetrievalScore {
  cases: number;
  /** Fraction whose answer was the FIRST hit. What a one-shot prompt gets. */
  precisionAt1: number;
  /** Fraction found anywhere in the top 5. What a packed context gets. */
  recallAt5: number;
  /** Mean reciprocal rank — rewards being right AND being near the top. */
  mrr: number;
  outcomes: CaseOutcome[];
  misses: CaseOutcome[];
}

const matches = (hit: ScorableHit, want: RetrievalCase["expect"]): boolean => {
  if (String(hit.documentNumber ?? "") !== want.documentNumber) return false;
  if (want.page !== undefined && Number(hit.page) !== want.page) return false;
  return true;
};

/**
 * Score a run of the corpus.
 *
 * `results` is parallel to `cases` — one ranked hit list per case, in order.
 */
export function scoreRetrieval(cases: RetrievalCase[], results: ScorableHit[][]): RetrievalScore {
  const outcomes: CaseOutcome[] = cases.map((c, i) => {
    const hits = results[i] ?? [];
    const idx = hits.findIndex((h) => matches(h, c.expect));
    return { id: c.id, question: c.question, rank: idx + 1, found: idx >= 0, note: c.note };
  });

  const n = outcomes.length || 1;
  const at = (k: number) => outcomes.filter((o) => o.found && o.rank <= k).length / n;

  return {
    cases: outcomes.length,
    precisionAt1: Number(at(1).toFixed(4)),
    recallAt5: Number(at(5).toFixed(4)),
    mrr: Number((outcomes.reduce((s, o) => s + (o.found ? 1 / o.rank : 0), 0) / n).toFixed(4)),
    outcomes,
    misses: outcomes.filter((o) => !o.found),
  };
}

/* ── Citation fidelity ────────────────────────────────────────────────────── */

export interface Claim {
  /** What the answer asserted, e.g. "40 MPa at 28 days". */
  text: string;
  /** The passage it pointed at. Absent means the claim was uncited. */
  citedText?: string;
  citedDocument?: string;
}

export interface CitationVerdict {
  claim: string;
  /** cited AND the passage supports it */
  supported: boolean;
  /** the claim carried no citation at all */
  uncited: boolean;
  /** cited a passage that does not contain what was claimed */
  contradicted: boolean;
  why: string;
}

/** Tokens worth checking: numbers, units and identifiers, not "the" and "and". */
function salient(text: string): string[] {
  const raw = String(text ?? "").toLowerCase().match(/[a-z0-9][a-z0-9./-]*/g) ?? [];
  return raw.filter(
    (t) =>
      /\d/.test(t) || // 40, 120, a-201, 03/30/00 — the load-bearing parts
      (t.length > 4 && !STOP.has(t)),
  );
}

const STOP = new Set([
  "shall", "should", "which", "there", "these", "those", "their", "about",
  "where", "while", "being", "other", "under", "after", "before", "between",
]);

/**
 * Does the cited passage actually say what the claim says?
 *
 * Deliberately generous on wording and strict on substance: every NUMBER in the
 * claim must appear in the passage, because a citation that supports "40 MPa"
 * with a passage saying 30 is the exact failure worth catching. Prose overlap
 * only has to be partial — a model paraphrasing a clause is doing its job.
 */
export function verifyCitation(claim: Claim, opts: { minOverlap?: number } = {}): CitationVerdict {
  const minOverlap = opts.minOverlap ?? 0.5;

  if (!claim.citedText) {
    return {
      claim: claim.text, supported: false, uncited: true, contradicted: false,
      why: "No citation. On a construction project an uncited number is an opinion.",
    };
  }

  const want = salient(claim.text);
  const have = new Set(salient(claim.citedText));
  if (!want.length) {
    return { claim: claim.text, supported: true, uncited: false, contradicted: false, why: "Nothing checkable in the claim." };
  }

  const numbers = want.filter((t) => /\d/.test(t));
  const missingNumbers = numbers.filter((t) => !have.has(t));
  if (missingNumbers.length) {
    return {
      claim: claim.text, supported: false, uncited: false, contradicted: true,
      why: `Cited passage does not contain: ${missingNumbers.join(", ")}. A citation that does not carry the figure is worse than none — it looks checked.`,
    };
  }

  const overlap = want.filter((t) => have.has(t)).length / want.length;
  return overlap >= minOverlap
    ? { claim: claim.text, supported: true, uncited: false, contradicted: false, why: `${Math.round(overlap * 100)}% of salient terms present.` }
    : {
        claim: claim.text, supported: false, uncited: false, contradicted: true,
        why: `Only ${Math.round(overlap * 100)}% of salient terms appear in the cited passage.`,
      };
}

export interface CitationScore {
  claims: number;
  supported: number;
  uncited: number;
  contradicted: number;
  /** The headline: what fraction of assertions can be stood behind. */
  fidelity: number;
  verdicts: CitationVerdict[];
}

export function scoreCitations(claims: Claim[], opts?: { minOverlap?: number }): CitationScore {
  const verdicts = claims.map((c) => verifyCitation(c, opts));
  const n = verdicts.length || 1;
  return {
    claims: verdicts.length,
    supported: verdicts.filter((v) => v.supported).length,
    uncited: verdicts.filter((v) => v.uncited).length,
    contradicted: verdicts.filter((v) => v.contradicted).length,
    fidelity: Number((verdicts.filter((v) => v.supported).length / n).toFixed(4)),
    verdicts,
  };
}

/* ── Reporting ────────────────────────────────────────────────────────────── */

export function formatRetrieval(r: RetrievalScore): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    `retrieval · ${r.cases} cases`,
    `  precision@1 ${pct(r.precisionAt1)}   recall@5 ${pct(r.recallAt5)}   MRR ${r.mrr.toFixed(3)}`,
  ];
  for (const m of r.misses) lines.push(`  MISS  ${m.id}  "${m.question}"${m.note ? ` — ${m.note}` : ""}`);
  return lines.join("\n");
}

export function formatCitations(s: CitationScore): string {
  const lines = [
    `citations · ${s.claims} claims`,
    `  fidelity ${(s.fidelity * 100).toFixed(1)}%   uncited ${s.uncited}   contradicted ${s.contradicted}`,
  ];
  for (const v of s.verdicts.filter((x) => !x.supported)) lines.push(`  FAIL  "${v.claim}" — ${v.why}`);
  return lines.join("\n");
}
