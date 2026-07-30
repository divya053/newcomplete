-- 0002 — isolation witness (ws 0.4), MariaDB port. On Postgres this used pgvector
-- (a real vector(1024) column + cosine operator) to prove RLS held even on a
-- similarity search. MariaDB 10.4 has no vector type, so the embedding is stored as
-- a JSON array of floats and similarity is computed app-side (see schema/probe.ts).
-- The table still proves the thing that matters now: an owned table carrying
-- embeddings is tenant-isolated by the scoped repository (see isolation.test.ts).
CREATE TABLE IF NOT EXISTS probe_vectors (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  content TEXT NOT NULL,
  embedding JSON NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
