import { int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { baseColumns } from "./_base";
import { json } from "./_types";

/**
 * Configurable trust thresholds (ws 0.8, guardrail #7) — the DIAL, not a constant.
 * COGS / accuracy / calibration bars live here as versioned, audited config and
 * take effect with NO deploy. Per-tenant (carries org_id via baseColumns). Changing
 * one requires THRESHOLD_MANAGE + a new version + an audit row.
 */
export const thresholds = mysqlTable("thresholds", {
  ...baseColumns,
  key: varchar("key", { length: 255 }).notNull(), // e.g. "boq.min_confidence"
  value: json<unknown>("value").notNull(),
  version: int("version").notNull().default(1),
});
