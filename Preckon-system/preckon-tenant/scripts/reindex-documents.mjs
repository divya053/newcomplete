// Build the retrieval index for revisions that predate it.
//
//   npm run reindex            # everything not yet indexed
//   npm run reindex -- --all   # rebuild every revision, including indexed ones
//   npm run reindex -- --dry   # report what would happen, change nothing
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// indexRevision was written, tested, and never called. `chunk` held zero rows,
// so every question asked of the document set was answered from an empty index.
// addRevision now indexes on the way in, which fixes tomorrow and does nothing
// for the documents already filed — and those are the whole corpus.
//
// ── WHAT IT WILL AND WILL NOT TOUCH ──────────────────────────────────────────
//
// Only revisions with a file behind them and text extracted from it. A scan
// awaiting OCR has a file and no readable pages; indexing it would write
// nothing and report success, so it is counted as skipped and named, because
// "0 passages" on a document somebody expects to search is the thing worth
// seeing.
//
// Re-runnable. indexRevision deletes a revision's existing chunks at the
// current INDEX_VERSION before inserting, so running this twice leaves the same
// index rather than two copies of it.

import { config } from "dotenv";
config();

const DRY = process.argv.includes("--dry");
const ALL = process.argv.includes("--all");

const { query, pool } = await import("../src/lib/db.ts");
const { indexRevisionFile, INDEX_VERSION } = await import("../src/lib/doc/index-store.ts");

/* Revisions worth considering: one that points at a file. Without --all, the
   ones that have no chunks at the current index version — which is both "never
   indexed" and "indexed by an older version whose chunks no longer count". */
const rows = await query(
  `SELECT v.id, v.tenant_id, v.project_id, v.file_id, v.revision_code, v.state,
          d.document_number, d.title,
          (SELECT COUNT(*) FROM chunk c
            WHERE c.revision_id = v.id AND c.index_version = ?) AS chunks
     FROM document_revision v
     JOIN document_register d ON d.id = v.document_id AND d.tenant_id = v.tenant_id
    WHERE v.file_id IS NOT NULL
    ORDER BY v.created_at ASC`,
  [INDEX_VERSION],
);

const todo = ALL ? rows : rows.filter((r) => Number(r.chunks) === 0);

console.log(`${rows.length} revision(s) with a file · ${todo.length} to index${ALL ? " (--all)" : ""}${DRY ? " · DRY RUN" : ""}\n`);

let indexed = 0, chunks = 0, empty = 0, failed = 0;

for (const r of todo) {
  const label = `${r.document_number} rev ${r.revision_code}`.padEnd(34);
  if (DRY) {
    console.log(`  would index  ${label} ${r.title ?? ""}`);
    continue;
  }
  try {
    const res = await indexRevisionFile(r.tenant_id, r.project_id, r.id, r.file_id);
    if (!res) {
      empty++;
      // Named, not just counted: a document somebody expects to search and
      // cannot is worth a line each.
      console.log(`  no text      ${label} — file has no extracted pages (a scan awaiting OCR?)`);
    } else {
      indexed++;
      chunks += res.chunks;
      console.log(`  indexed      ${label} ${String(res.chunks).padStart(4)} passages`);
    }
  } catch (e) {
    failed++;
    console.error(`  FAILED       ${label} ${e?.message ?? e}`);
  }
}

console.log(
  DRY
    ? `\nDry run. ${todo.length} revision(s) would be indexed.`
    : `\nIndexed ${indexed} revision(s), ${chunks} passages.` +
      (empty ? ` ${empty} had no extractable text.` : "") +
      (failed ? ` ${failed} failed.` : ""),
);

await pool.end?.();
process.exit(failed ? 1 : 0);
