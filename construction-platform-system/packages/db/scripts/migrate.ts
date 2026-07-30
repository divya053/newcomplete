/**
 * Forward-only migration runner (ws 0.2), MariaDB port. Applies every numbered .sql
 * in migrations/ in order, as the OWNER (DATABASE_URL — root, not ci_app), recording
 * applied files in a _migrations table so re-runs are no-ops. Expand-contract is
 * enforced in CI (the destructive-op check), not here.
 *
 * NOTE: MySQL/MariaDB DDL auto-commits, so a migration file is NOT wrapped in a
 * rollback-able transaction the way the Postgres runner was — each file is applied
 * as one multi-statement batch. Keep migrations idempotent (IF NOT EXISTS /
 * CREATE OR REPLACE) so a re-apply after a partial failure is safe.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");
const url = process.env.DATABASE_URL ?? "mysql://root@localhost:3306/construction_intelligence";

async function main() {
  const conn = await mysql.createConnection({ uri: url, multipleStatements: true });
  await conn.query(
    "CREATE TABLE IF NOT EXISTS _migrations (name VARCHAR(255) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB",
  );
  const [appliedRows] = await conn.query("SELECT name FROM _migrations");
  const applied = new Set((appliedRows as { name: string }[]).map((r) => r.name));

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· ${file} (already applied)`);
      continue;
    }
    const sqlText = readFileSync(join(migrationsDir, file), "utf8");
    try {
      await conn.query(sqlText);
      await conn.query("INSERT INTO _migrations(name) VALUES (?)", [file]);
      console.log(`✓ ${file}`);
    } catch (e) {
      await conn.end();
      throw new Error(`migration ${file} failed: ${(e as Error).message}`);
    }
  }
  await conn.end();
  console.log("\nMigrations complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
