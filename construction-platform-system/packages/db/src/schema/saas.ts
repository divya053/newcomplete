import { sql } from "drizzle-orm";
import { bigint, boolean, char, datetime, decimal, int, mysqlTable, primaryKey, text, varchar } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { json } from "./_types";

/**
 * SaaS host/tenant layer (multi-tenant billing & entitlement).
 *
 * GLOBAL, host-managed config (no org_id — like `orgs`/`user`): the platform owner
 * (the host org, orgs.is_host) defines FEATURES (priced capabilities) and bundles
 * them into EDITIONS (plans). Each TENANT org subscribes to an edition
 * (org_subscriptions); the union of that edition's features is the tenant's
 * entitlement, which gates the modules they can use (BOQ, BOQ-AI, Drawing, …).
 */

const cid = (name: string) => char(name, { length: 36 });
const created = () => datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);

// A priced capability the host sells (e.g. "boq", "boq_ai", "drawing", "narrative").
export const features = mysqlTable("features", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull().default("0.00"),
  active: boolean("active").notNull().default(true),
  // Host catalog columns (spec §4.1 — added in 0009_host.sql).
  category: varchar("category", { length: 20 }).notNull().default("module"), // module|capability|limit|usage
  type: varchar("type", { length: 10 }).notNull().default("flag"), // flag|limit|metric
  valueType: varchar("value_type", { length: 10 }).notNull().default("boolean"), // boolean|numeric|enum
  unit: varchar("unit", { length: 40 }),
  allowedValues: json<string[]>("allowed_values"),
  status: varchar("status", { length: 16 }).notNull().default("active"), // active|beta|deprecated
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: created(),
});

// A plan = a named bundle of features. Tenants subscribe to one.
export const editions = mysqlTable("editions", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  // Host catalog columns (spec §4.2).
  key: varchar("key", { length: 64 }),
  status: varchar("status", { length: 16 }).notNull().default("published"), // draft|published|archived
  isPublic: boolean("is_public").notNull().default(true),
  trialDays: int("trial_days").notNull().default(14),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: created(),
});

export const editionFeatures = mysqlTable(
  "edition_features",
  {
    editionId: cid("edition_id").notNull(),
    featureId: cid("feature_id").notNull(),
    // Matrix-cell payload (spec §4.3).
    enabled: boolean("enabled").notNull().default(true),
    limitValue: decimal("limit_value", { precision: 14, scale: 2 }), // cap / included quota; NULL = unlimited
    enumValue: varchar("enum_value", { length: 40 }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.editionId, t.featureId] }) }),
);

// A tenant org's subscription to an edition. Latest active row = current plan.
export const orgSubscriptions = mysqlTable("org_subscriptions", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  orgId: cid("org_id").notNull(),
  editionId: cid("edition_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"), // active|trialing|past_due|canceled
  // Billing shape (spec §7.1 mirror).
  currencyCode: char("currency_code", { length: 3 }).notNull().default("USD"),
  interval: varchar("interval", { length: 10 }).notNull().default("monthly"),
  seats: int("seats"),
  planAmountMinor: bigint("plan_amount_minor", { mode: "number" }).notNull().default(0),
  usageMtdMinor: bigint("usage_mtd_minor", { mode: "number" }).notNull().default(0),
  currentPeriodEnd: datetime("current_period_end", { mode: "date", fsp: 3 }),
  createdAt: created(),
});
