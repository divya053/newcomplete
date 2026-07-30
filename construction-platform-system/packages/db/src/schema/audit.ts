import { sql } from "drizzle-orm";
import { char, datetime, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { json } from "./_types";

/**
 * Append-only audit spine (ws 0.5, guardrail #4). Immutability is enforced at the
 * DB by BEFORE UPDATE / BEFORE DELETE triggers that SIGNAL an error for ANY user,
 * including root (see migrations/0000_init.sql). Rows are written inside the SAME
 * transaction as the change they record (atomic) via audit().
 *
 * MariaDB port: Postgres enforced immutability with two layers (a per-role REVOKE
 * plus a trigger). MariaDB can't subtract a table privilege from a database-level
 * grant, so the trigger is the single, stronger enforcement point — it blocks the
 * owner too, which the Postgres REVOKE did not. Range-partitioning by month (the
 * Postgres baseline) is deferred; the table is a plain append-only log for Phase 0.
 */
export const auditLog = mysqlTable("audit_log", {
  // No baseColumns: audit rows are immutable (no updated_at / archivedAt).
  // orgId is still present (carried for scoped reads).
  id: char("id", { length: 36 }).notNull(),
  orgId: char("org_id", { length: 36 }).notNull(),
  actorUserId: varchar("actor_user_id", { length: 255 }), // Better Auth user id (text)
  action: varchar("action", { length: 255 }).notNull(), // e.g. "boq.published", "threshold.changed"
  entityType: varchar("entity_type", { length: 255 }).notNull(),
  entityId: char("entity_id", { length: 36 }),
  before: json<unknown>("before"),
  after: json<unknown>("after"),
  correlationId: varchar("correlation_id", { length: 255 }), // ties the row to the request trace (ws 0.8)
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});
