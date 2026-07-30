import { sql } from "drizzle-orm";
import { char, datetime } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";

/**
 * The base-table spine EVERY owned table carries (ws 0.2, guardrail #2).
 * `orgId` is the tenant key the scoped repository keys on — present on every owned
 * table, including vector tables. Timestamps + soft-archive are universal. PKs are
 * UUIDv7 app-side (time-ordered), stored as CHAR(36) (MariaDB has no native uuid).
 *
 * MariaDB port note: Postgres `uuid`/`timestamptz`/`jsonb` map to `CHAR(36)`/
 * `DATETIME(3)`/`JSON`. Times are stored UTC; the app passes `Date` objects.
 */
export const baseColumns = {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
  orgId: char("org_id", { length: 36 }).notNull(), // tenant key — the isolation hook
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  archivedAt: datetime("archived_at", { mode: "date", fsp: 3 }), // soft-archive; null = active
};

/** DB-side default for raw SQL contexts (MariaDB UUID() — v1, fallback only). */
export const uuidDefault = sql`(UUID())`;

// EXPAND-CONTRACT, never a destructive in-place change (guardrail #5):
//   EXPAND   (migration N):   ALTER TABLE projects ADD COLUMN region text;  -- nullable
//   MIGRATE  (app backfill):  populate region everywhere
//   CONTRACT (migration N+k): ALTER TABLE projects MODIFY region text NOT NULL;
