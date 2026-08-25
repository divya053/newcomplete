// schema.sql must declare every table the migrations create.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// tenant-scoping.test.ts derives its list of tenant-scoped tables by reading
// db/schema.sql. A table that exists only in a migration is therefore INVISIBLE
// to it: queries against that table are never checked, and the test passes green
// having verified nothing about them.
//
// That is a security control that fails open, and it is not hypothetical. The
// DocLogix tables were added in migration 019 and the scoping guard passed
// vacuously over all seven. The moment they were added to schema.sql it found
// six real violations — correlated subqueries relying on the parent join for
// isolation rather than stating it.
//
// So the isolation guarantee depends on a file staying in sync by hand, and
// nothing was checking. This checks.
//
// It also keeps a fresh install honest: schema.sql is what a new database is
// built from, so a table only in a migration means a fresh install and a
// migrated one have different shapes.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SCHEMA = join(ROOT, "db", "schema.sql");
const MIGRATIONS = join(ROOT, "db", "migrations");

/**
 * Strip single-quoted string literals, one line at a time.
 *
 * Migrations guard ALTERs on information_schema and build the statement as a
 * string, so a CREATE inside one is a literal rather than real DDL and must not
 * count as a new table.
 *
 * The first attempt at this matched `'[^']*CREATE\s+TABLE[^']*\btable\b[^']*'`
 * across the whole file. `[^']*` happily spans everything between ANY two
 * apostrophes — including the ones in prose comments like "don't" — so real DDL
 * sitting between two such quotes was silently treated as quoted. It excluded
 * thirteen genuine tables (the whole PCM layer, bim_proposal, bim_authored_tool)
 * and the suite went green having checked nothing about them.
 *
 * That is precisely the vacuous pass this file was written to prevent, so the
 * replacement is deliberately narrow: quotes are only ever paired WITHIN a
 * line, which is how these migrations actually write them.
 */
function stripQuoted(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/'[^']*'/g, "''"))
    .join("\n");
}

/** Table names created by a chunk of SQL, ignoring anything inside a string. */
function createdTables(sql: string): Set<string> {
  const out = new Set<string>();
  // Matches CREATE TABLE, CREATE TABLE IF NOT EXISTS, with or without backticks.
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-z_][a-z0-9_]*)`?/gi;
  for (const m of stripQuoted(sql).matchAll(re)) out.add(m[1].toLowerCase());
  return out;
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
}

describe("schema.sql and the migrations agree", () => {
  const schemaSql = readFileSync(SCHEMA, "utf8");
  const schemaTables = createdTables(schemaSql);

  it("finds tables in schema.sql at all, so a silent pass means the rule ran", () => {
    // Without this, a change to the parser that stops matching would turn every
    // assertion below into a vacuous pass — which is the exact failure mode this
    // whole file exists to prevent.
    expect(schemaTables.size).toBeGreaterThan(30);
    expect(schemaTables).toContain("project");
    expect(schemaTables).toContain("artifact");
  });

  it("finds migration files at all", () => {
    expect(migrationFiles().length).toBeGreaterThan(5);
  });

  it("declares every table any migration creates", () => {
    const missing: { table: string; migration: string }[] = [];

    for (const file of migrationFiles()) {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8");
      for (const table of createdTables(sql)) {
        if (schemaTables.has(table)) continue;
        missing.push({ table, migration: file });
      }
    }

    expect(
      missing,
      missing.length
        ? `\n\nThese tables exist in a migration but not in db/schema.sql:\n` +
          missing.map((m) => `  ${m.table.padEnd(28)} (${m.migration})`).join("\n") +
          `\n\nUntil they are declared there, tenant-scoping.test.ts cannot see them and\n` +
          `every query against them goes unchecked. Add the CREATE TABLE to schema.sql.\n`
        : "",
    ).toEqual([]);
  });

  it("keeps every tenant-scoped table visible to the scoping guard", () => {
    /* The specific consequence. A table carrying tenant_id that schema.sql does
       not know about is a table whose isolation nothing verifies. */
    const scoped = new Set<string>();
    let current: string | null = null;
    for (const line of schemaSql.split("\n")) {
      const create = line.match(/^CREATE TABLE(?: IF NOT EXISTS)? `?([a-z_]+)`?/i);
      if (create) current = create[1];
      if (current && /^\s*`?tenant_id`?\s/i.test(line)) { scoped.add(current); current = null; }
      if (/^\)/.test(line)) current = null;
    }

    // Spot-check the ones added most recently, since those are the ones most
    // likely to have been missed.
    for (const t of ["document_register", "document_revision", "transmittal",
                     "source_region", "document_comment", "ai_usage_ledger"]) {
      expect(scoped, `${t} must be visible to the tenant-scoping guard`).toContain(t);
    }
  });
});

describe("schema.sql declares every COLUMN the migrations add", () => {
  /* The table check above was not enough.
     `twoFactorEnabled` was added to the `user` table by migration 025 and never
     added here. docker-compose initialises the database from schema.sql alone —
     it does not apply migrations — so every fresh database lacked the column,
     Better Auth could not create a user at all:

       ERROR [Better Auth]: Failed to create user
       Error: Unknown column 'twoFactorEnabled' in 'field list'

     and every E2E run failed at the first sign-in. A missing column reads as
     broken auth, exactly the way the missing fixture did.

     `scim_external_id` (migration 026) had drifted the same way. */
  const schemaSql = readFileSync(SCHEMA, "utf8");

  /** Columns a migration adds, whether by plain ALTER or inside a guarded string. */
  function addedColumns(sql: string): string[] {
    const out = new Set<string>();
    for (const m of sql.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi)) {
      out.add(m[1]);
    }
    return [...out];
  }

  it("finds ADD COLUMN statements at all, so a pass is not vacuous", () => {
    const all = migrationFiles().flatMap((f) => addedColumns(readFileSync(join(MIGRATIONS, f), "utf8")));
    expect(all.length).toBeGreaterThan(5);
  });

  it("declares every added column", () => {
    const missing: { column: string; migration: string }[] = [];

    for (const file of migrationFiles()) {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8");
      for (const col of addedColumns(sql)) {
        // Word-boundary match: the column has to appear as an identifier
        // somewhere in schema.sql, not merely as a substring of another name.
        if (new RegExp(`\\b${col}\\b`).test(schemaSql)) continue;
        missing.push({ column: col, migration: file });
      }
    }

    expect(
      missing,
      missing.length
        ? `\n\nThese columns are added by a migration but never declared in db/schema.sql:\n` +
          missing.map((m) => `  ${m.column.padEnd(28)} (${m.migration})`).join("\n") +
          `\n\ndocker-compose builds a database from schema.sql ALONE. A column only in\n` +
          `a migration means every fresh install is missing it, and the failure\n` +
          `surfaces as something unrelated — "Unknown column ... in 'field list'"\n` +
          `during sign-in rather than anything pointing at the schema.\n`
        : "",
    ).toEqual([]);
  });
});
