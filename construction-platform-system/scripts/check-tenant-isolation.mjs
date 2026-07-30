#!/usr/bin/env node
/**
 * Tenant-isolation guard (enforces guardrail #2 in CI).
 *
 * WHY THIS EXISTS: the MariaDB port removed Row-Level Security, so the ONLY thing
 * keeping one tenant's rows from another is the `org_id` predicate the scoped
 * repository injects (packages/db/src/repositories/base.ts, via withTenant). A raw
 * query on an OWNED table that forgets that predicate silently leaks across tenants.
 *
 * WHAT IT CHECKS: any statement that hits an owned table (one with `org_id`) through
 * the UNSCOPED `db` client must mention `orgId`/`org_id` in the same statement. The
 * safe path — `withTenant(...)` + a ScopedRepository (which query via `tx`, not `db`)
 * — is unaffected. This is a heuristic backstop, not a substitute for going through
 * the scoped repository; it exists to catch the egregious unscoped-`db` leak.
 *
 * Run: `node scripts/check-tenant-isolation.mjs` (wired as `pnpm lint:isolation`).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_DIR = join(ROOT, "packages/db/src/schema");
const SCAN_ROOTS = [join(ROOT, "apps/web/src"), join(ROOT, "apps/web/app")];

// Files exempt from the check (they query owned tables by a NON-org key on purpose).
// Keep this list SHORT and justified — every entry is a hole in the backstop.
const ALLOWLIST = [
  // resolveContext is the auth/tenant BOOTSTRAP: it discovers which orgs a user
  // belongs to (by userId) BEFORE a tenant is known, so it can't be org-scoped.
  "apps/web/src/server/context.ts",
  // HOST CONTROL PLANE (Preckon Host backend design §0.2): the platform-operator
  // console is intentionally CROSS-TENANT — it reads/acts on every tenant's records
  // (invoices, impersonation sessions, failed jobs, entitlement overrides, the global
  // `user` identity table). These control-plane tables are NOT under tenant isolation;
  // access is gated instead by resolveHostContext (host-org membership) + a required
  // HOST permission, and every mutation is audited. Org-scoping them would be wrong.
  "apps/web/src/domain/host/queries.ts",
  "apps/web/src/domain/host/mutations.ts",
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      out.push(...walk(p));
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** An owned table = a mysqlTable whose body spreads baseColumns or declares org_id. */
function ownedTables() {
  const owned = new Set();
  for (const f of walk(SCHEMA_DIR)) {
    const src = readFileSync(f, "utf8");
    // Split into per-declaration chunks so each table's body runs until the next one.
    const chunks = src.split(/\nexport const /);
    for (const chunk of chunks) {
      const m = chunk.match(/^(\w+) = mysqlTable\(/);
      if (!m) continue;
      const name = m[1];
      if (chunk.includes("baseColumns") || chunk.includes('"org_id"') || chunk.includes("org_id")) owned.add(name);
    }
  }
  return owned;
}

const OWNED = ownedTables();
const ownedAlt = [...OWNED].join("|");
// A query "statement" = an await chain rooted at the unscoped `db` client.
const STMT = /\bdb\s*\.\s*(?:select|insert|update|delete)[\s\S]*?(?:;|\n\n)/g;
const HITS_OWNED = new RegExp(`schema\\.(?:${ownedAlt})\\b`);
const HAS_ORG = /\borg_?[Ii]d\b/;

const violations = [];
for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (ALLOWLIST.includes(rel)) continue;
    const src = readFileSync(file, "utf8");
    let m;
    while ((m = STMT.exec(src))) {
      const stmt = m[0];
      if (HITS_OWNED.test(stmt) && !HAS_ORG.test(stmt)) {
        const line = src.slice(0, m.index).split("\n").length;
        const table = stmt.match(HITS_OWNED)?.[0] ?? "owned table";
        violations.push(`${rel}:${line} — raw db query on ${table} with no org_id filter`);
      }
    }
  }
}

if (OWNED.size === 0) {
  console.error("isolation guard: found 0 owned tables — schema parse likely broke. Failing.");
  process.exit(1);
}

if (violations.length) {
  console.error(`\n✖ Tenant-isolation guard failed (${violations.length}):\n`);
  for (const v of violations) console.error("  " + v);
  console.error(
    "\nOwned tables must be reached through a ScopedRepository (withTenant + tx), not the raw `db` client.",
  );
  console.error("If a use is a legitimate pre-tenant bootstrap, add it to ALLOWLIST with a reason.\n");
  process.exit(1);
}

console.log(`✓ Tenant-isolation guard passed — checked ${OWNED.size} owned tables, no unscoped raw-db access.`);
