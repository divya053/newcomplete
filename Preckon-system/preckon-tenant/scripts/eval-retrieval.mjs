// Run a retrieval corpus against a real project and score what comes back.
//
//   npm run eval                          # every corpus in eval/corpus
//   npm run eval -- --project DV-001      # one project
//   npm run eval -- --min-mrr 0.6         # fail the run below a threshold (CI)
//
// ── WHAT THIS MEASURES, AND WHY IT NEEDS NO API KEY ──────────────────────────
//
// Retrieval is a pure function of an index and a question — no model decides
// what comes back. So the score is exact, cheap, and can gate a deploy, which
// is the opposite of every other AI measure in this product.
//
// It is also the measure that matters most right now. The index was connected
// only recently; before that `chunk` held zero rows and every question was
// answered from whatever the caller had put in the envelope. A number here is
// the difference between believing retrieval works and knowing it.
//
// ── ON THRESHOLDS ────────────────────────────────────────────────────────────
//
// --min-mrr exits non-zero below the bar, for CI. Set it just under the
// measured score rather than at a round number: a threshold far below reality
// lets quality fall a long way before anyone is told, which is the same as not
// measuring. Raise it when the score rises.

import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
config();

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(HERE, "..", "eval", "corpus");

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const onlyProject = arg("project");
const minMrr = arg("min-mrr") ? Number(arg("min-mrr")) : null;

const { query, pool } = await import("../src/lib/db.ts");
const { search } = await import("../src/lib/doc/index-store.ts");
const { scoreRetrieval, formatRetrieval } = await import("../src/lib/ai/eval/retrieval.ts");

const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".json") && f !== "example.json");
if (!files.length) {
  console.log(`No corpora in ${CORPUS_DIR}.`);
  console.log("eval/corpus/example.json shows the format. Copy it and name it after a project code.");
  await pool.end?.();
  process.exit(0);
}

let worst = 1;
let ran = 0;

for (const f of files) {
  const corpus = JSON.parse(readFileSync(join(CORPUS_DIR, f), "utf8"));
  if (onlyProject && corpus.project !== onlyProject) continue;

  const [project] = await query(
    "SELECT id, tenant_id, name, code FROM project WHERE code = ? LIMIT 1",
    [corpus.project],
  );
  if (!project) {
    console.log(`\n${f}: no project with code ${corpus.project} in this database — skipped.`);
    continue;
  }

  /* How much of this project is even indexed. A corpus scoring 0% against an
     empty index is not a retrieval regression, and reporting it as one sends
     somebody to debug ranking when the answer is that nothing was ingested. */
  const [{ n: chunks }] = await query(
    "SELECT COUNT(*) AS n FROM chunk WHERE tenant_id = ? AND project_id = ?",
    [project.tenant_id, project.id],
  );

  console.log(`\n── ${project.name} (${project.code}) · ${chunks} passages indexed`);
  if (Number(chunks) === 0) {
    console.log("   Index is empty. Run `npm run reindex` before reading anything into a score.");
  }

  const results = [];
  for (const c of corpus.cases) {
    const r = await search(project.tenant_id, project.id, c.question, { limit: 5 });
    results.push(r.hits.map((h) => ({ documentNumber: h.documentNumber, page: h.page, text: h.text })));
  }

  const score = scoreRetrieval(corpus.cases, results);
  console.log(formatRetrieval(score).split("\n").map((l) => "   " + l).join("\n"));
  worst = Math.min(worst, score.mrr);
  ran++;
}

if (!ran) {
  console.log("\nNothing ran.");
  await pool.end?.();
  process.exit(0);
}

await pool.end?.();

if (minMrr !== null && worst < minMrr) {
  console.error(`\nFAIL: worst MRR ${worst.toFixed(3)} is below the --min-mrr ${minMrr} threshold.`);
  process.exit(1);
}
console.log(`\nWorst MRR across ${ran} corpus/corpora: ${worst.toFixed(3)}`);
process.exit(0);
