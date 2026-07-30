import { sql } from "drizzle-orm";
import { bigint, boolean, char, datetime, mysqlTable, text, unique, varchar } from "drizzle-orm/mysql-core";
import { v7 as uuidv7 } from "uuid";
import { json } from "./_types";

/**
 * Tenancy + RBAC model (ws 0.3 + 0.4, designed together — they share this).
 * GLOBAL identity (the `user` table) is owned by Better Auth (see 0001_auth.sql);
 * its id is a TEXT id. Orgs are the tenant. Memberships tie a Better Auth user to
 * an org with a role — the access edge resolveContext walks.
 *
 * MariaDB port: columns that carry a UNIQUE constraint must be VARCHAR (MariaDB
 * can't index an unbounded TEXT without a prefix length), so slug/name/user_id are
 * VARCHAR(255). Free-form text stays TEXT.
 */

// GLOBAL identity, owned by Better Auth (see 0001_auth.sql) — NOT tenant-scoped.
// Declared read-only here (id/name/email only) so the domain can JOIN members onto
// their identity. Writes to this table go only through Better Auth.
export const users = mysqlTable("user", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull(),
});

// The tenant. NOT an owned table itself (it has no org_id — it IS the org).
export const orgs = mysqlTable("orgs", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  // The platform owner (TechSME) is the HOST: it manages features/editions/tenants.
  // All other orgs are tenants. Exactly one host expected.
  isHost: boolean("is_host").notNull().default(false),
  // Host control-plane columns (spec §3 — added additively in 0009_host.sql).
  legalName: varchar("legal_name", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("active"), // trial|active|suspended|offboarding|offboarded
  region: varchar("region", { length: 40 }).notNull().default("ca-central"),
  primaryContactEmail: varchar("primary_contact_email", { length: 255 }),
  currentEditionId: char("current_edition_id", { length: 36 }), // entitlement anchor (§3.1.1)
  trialEndsAt: datetime("trial_ends_at", { mode: "date", fsp: 3 }),
  suspendedAt: datetime("suspended_at", { mode: "date", fsp: 3 }),
  suspendedReason: text("suspended_reason"),
  offboardedAt: datetime("offboarded_at", { mode: "date", fsp: 3 }),
  entitlementVersion: bigint("entitlement_version", { mode: "number" }).notNull().default(0),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

// Roles are per-org (system roles are copied in per org; custom roles live here too).
export const roles = mysqlTable(
  "roles",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    orgId: char("org_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(), // "owner" | "admin" | ... | custom
    isSystem: varchar("is_system", { length: 16 }).notNull().default("false"),
    // Catalog permission strings (validated against @ci/shared on write).
    permissions: json<string[]>("permissions").notNull(),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => ({ uqOrgName: unique().on(t.orgId, t.name) }),
);

// Org membership ties a global user to an org with a role — the access edge.
export const memberships = mysqlTable(
  "memberships",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => uuidv7()),
    orgId: char("org_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 255 }).notNull(), // Better Auth user id (text)
    roleId: char("role_id", { length: 36 }).notNull(),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => ({ uqOrgUser: unique().on(t.orgId, t.userId) }),
);
