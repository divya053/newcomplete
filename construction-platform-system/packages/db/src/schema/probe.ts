import { mysqlTable, text } from "drizzle-orm/mysql-core";
import { baseColumns } from "./_base";
import { json } from "./_types";

/**
 * The PROBE table (ws 0.2 + 0.4): an owned table WITH an embedding column, used to
 * prove tenant isolation holds on rows that carry vectors. Not a product table.
 *
 * MariaDB port: MariaDB 10.4 has no native vector type and no pgvector. Embeddings
 * are stored as a JSON array of floats; cosine similarity is computed app-side
 * (Phase 1) rather than via a DB operator. The isolation witness is therefore a
 * plain scoped-read test, not a vector-index search.
 */
export const probeVectors = mysqlTable("probe_vectors", {
  ...baseColumns,
  content: text("content").notNull(),
  embedding: json<number[]>("embedding"),
});

/**
 * App-side cosine distance over the JSON-stored embeddings (no DB vector operator on
 * MariaDB 10.4). Returns 1 - cosineSimilarity, so smaller = closer; safe on empty
 * or mismatched-length inputs.
 */
export function cosineDistance(a: number[], b: number[]): number {
  if (!a?.length || a.length !== b?.length) return 1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}
