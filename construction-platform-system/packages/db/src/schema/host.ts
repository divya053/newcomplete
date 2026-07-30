import { sql } from "drizzle-orm";
import { bigint, char, datetime, decimal, int, mysqlTable, primaryKey, text, varchar } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { json } from "./_types";

/**
 * Host control-plane tables (Preckon Host backend design §5–§10). GLOBAL, host-managed
 * (no org_id — like `orgs`/`editions`). Tenant lifecycle/anchor columns live on `orgs`
 * (identity.ts); catalog columns on `features`/`editions`/`edition_features` (saas.ts).
 * See migrations/0009_host.sql. Money is ALWAYS integer minor units + a currency code
 * (spec §0.3) — never a float amount.
 */

const cid = (name: string) => char(name, { length: 36 });
const created = () => datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const updated = () => datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);

// ── §6 Pricing ───────────────────────────────────────────────────────────────
export const currency = mysqlTable("currency", {
  code: char("code", { length: 3 }).primaryKey(),
  name: varchar("name", { length: 60 }).notNull(),
  symbol: varchar("symbol", { length: 8 }).notNull(),
  minorUnit: int("minor_unit").notNull().default(2),
  isActive: int("is_active").notNull().default(1),
  sortOrder: int("sort_order").notNull().default(0),
});

export const editionPrice = mysqlTable(
  "edition_price",
  {
    editionId: cid("edition_id").notNull(),
    currencyCode: char("currency_code", { length: 3 }).notNull(),
    interval: varchar("interval", { length: 10 }).notNull(), // monthly | annual
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull().default(0),
    isActive: int("is_active").notNull().default(1),
    updatedAt: updated(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.editionId, t.currencyCode, t.interval] }) }),
);

export const usageRate = mysqlTable(
  "usage_rate",
  {
    featureId: cid("feature_id").notNull(),
    currencyCode: char("currency_code", { length: 3 }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull().default(0),
    isActive: int("is_active").notNull().default(1),
    updatedAt: updated(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.featureId, t.currencyCode] }) }),
);

export const coupon = mysqlTable("coupon", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 120 }),
  discountType: varchar("discount_type", { length: 10 }).notNull(), // percent | fixed
  percentOff: decimal("percent_off", { precision: 5, scale: 2 }),
  amountOffMinor: bigint("amount_off_minor", { mode: "number" }),
  currencyCode: char("currency_code", { length: 3 }),
  duration: varchar("duration", { length: 12 }).notNull().default("once"),
  durationMonths: int("duration_months"),
  maxRedemptions: int("max_redemptions"),
  redeemedCount: int("redeemed_count").notNull().default(0),
  validUntil: datetime("valid_until", { mode: "date", fsp: 3 }),
  status: varchar("status", { length: 12 }).notNull().default("active"), // active | disabled | expired
  createdAt: created(),
});

// ── §5 Entitlement overrides ──────────────────────────────────────────────────
export const tenantEntitlementOverride = mysqlTable(
  "tenant_entitlement_override",
  {
    orgId: cid("org_id").notNull(),
    featureId: cid("feature_id").notNull(),
    enabledOverride: int("enabled_override"), // NULL = inherit
    limitValueOverride: decimal("limit_value_override", { precision: 14, scale: 2 }),
    limitUnlimitedOverride: int("limit_unlimited_override").notNull().default(0),
    enumValueOverride: varchar("enum_value_override", { length: 40 }),
    reason: text("reason").notNull(),
    expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: created(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.featureId] }) }),
);

// ── §3.3 Impersonation ────────────────────────────────────────────────────────
export const impersonationSession = mysqlTable("impersonation_session", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  orgId: cid("org_id").notNull(),
  hostUserId: varchar("host_user_id", { length: 255 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 10 }).notNull().default("active"), // active | ended | expired
  startedAt: datetime("started_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
  endedAt: datetime("ended_at", { mode: "date", fsp: 3 }),
});

// ── §7 Billing mirror ─────────────────────────────────────────────────────────
export const invoice = mysqlTable("invoice", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  number: varchar("number", { length: 40 }),
  orgId: cid("org_id").notNull(),
  currencyCode: char("currency_code", { length: 3 }).notNull().default("USD"),
  status: varchar("status", { length: 16 }).notNull().default("open"), // draft|open|paid|void|uncollectible
  subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull().default(0),
  discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
  taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
  totalMinor: bigint("total_minor", { mode: "number" }).notNull().default(0),
  amountDueMinor: bigint("amount_due_minor", { mode: "number" }).notNull().default(0),
  attemptCount: int("attempt_count").notNull().default(0),
  issuedAt: datetime("issued_at", { mode: "date", fsp: 3 }),
  dueDate: datetime("due_date", { mode: "date", fsp: 3 }),
  paidAt: datetime("paid_at", { mode: "date", fsp: 3 }),
  createdAt: created(),
});

export const invoiceLine = mysqlTable("invoice_line", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  invoiceId: cid("invoice_id").notNull(),
  kind: varchar("kind", { length: 12 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  quantity: decimal("quantity", { precision: 14, scale: 2 }).notNull().default("1"),
  unitAmountMinor: bigint("unit_amount_minor", { mode: "number" }).notNull().default(0),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull().default(0),
});

// ── §8 Notifications ──────────────────────────────────────────────────────────
export const notification = mysqlTable("notification", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  authorUserId: varchar("author_user_id", { length: 255 }),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  audienceType: varchar("audience_type", { length: 16 }).notNull().default("all_tenants"),
  audienceFilter: json<Record<string, unknown>>("audience_filter"),
  deliverInApp: int("deliver_in_app").notNull().default(1),
  deliverEmail: int("deliver_email").notNull().default(0),
  status: varchar("status", { length: 10 }).notNull().default("draft"), // draft | sending | sent
  recipients: int("recipients").notNull().default(0),
  sentAt: datetime("sent_at", { mode: "date", fsp: 3 }),
  createdAt: created(),
});

export const hostNotification = mysqlTable("host_notification", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  kind: varchar("kind", { length: 12 }).notNull(), // billing | tenant | security | system
  severity: varchar("severity", { length: 10 }).notNull().default("info"),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body"),
  link: varchar("link", { length: 255 }),
  correlationId: varchar("correlation_id", { length: 255 }),
  createdAt: created(),
});

export const hostNotificationRead = mysqlTable(
  "host_notification_read",
  {
    hostNotificationId: cid("host_notification_id").notNull(),
    hostUserId: varchar("host_user_id", { length: 255 }).notNull(),
    readAt: datetime("read_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => ({ pk: primaryKey({ columns: [t.hostNotificationId, t.hostUserId] }) }),
);

// ── §9 Platform settings ──────────────────────────────────────────────────────
export const platformSetting = mysqlTable("platform_setting", {
  key: varchar("key", { length: 120 }).primaryKey(),
  value: json<unknown>("value").notNull(),
  description: varchar("description", { length: 255 }),
  updatedBy: varchar("updated_by", { length: 255 }),
  updatedAt: updated(),
});

export const aiProvider = mysqlTable("ai_provider", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  key: varchar("key", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  kind: varchar("kind", { length: 12 }).notNull(), // llm | embedding | reranker
  role: varchar("role", { length: 20 }).notNull().default("primary"), // primary | fallback | embeddings
  baseUrl: varchar("base_url", { length: 255 }),
  apiKeySecretRef: varchar("api_key_secret_ref", { length: 255 }).notNull(),
  status: varchar("status", { length: 12 }).notNull().default("active"),
  createdAt: created(),
});

export const emailDomain = mysqlTable("email_domain", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  domain: varchar("domain", { length: 120 }).notNull().unique(),
  status: varchar("status", { length: 12 }).notNull().default("pending"),
  dnsRecords: json<{ type: string; name: string; value: string }[]>("dns_records"),
  verifiedAt: datetime("verified_at", { mode: "date", fsp: 3 }),
  createdAt: created(),
});

// ── §10 Observability ─────────────────────────────────────────────────────────
export const jobFailure = mysqlTable("job_failure", {
  id: cid("id").primaryKey().$defaultFn(() => uuidv7()),
  jobId: varchar("job_id", { length: 80 }).notNull(),
  jobType: varchar("job_type", { length: 80 }).notNull(),
  queue: varchar("queue", { length: 40 }).notNull().default("default"),
  orgId: cid("org_id"),
  errorClass: varchar("error_class", { length: 80 }).notNull(),
  errorMessage: text("error_message").notNull(),
  traceback: text("traceback"),
  attempt: int("attempt").notNull().default(0),
  maxAttempts: int("max_attempts"),
  envelope: json<Record<string, unknown>>("envelope"),
  correlationId: varchar("correlation_id", { length: 255 }),
  failedAt: datetime("failed_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  resolved: int("resolved").notNull().default(0),
  resolvedBy: varchar("resolved_by", { length: 255 }),
  resolvedAt: datetime("resolved_at", { mode: "date", fsp: 3 }),
  resolutionNote: text("resolution_note"),
});
