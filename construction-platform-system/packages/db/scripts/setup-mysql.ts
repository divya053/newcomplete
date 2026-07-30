/**
 * One-time bootstrap for a MariaDB/XAMPP server (replaces the Postgres role-init +
 * the embedded-postgres dev cluster). Connects as the ROOT/owner connection, then:
 *   1. creates the app database,
 *   2. creates the least-privilege `ci_app` user the running app connects as
 *      (DML only, never DDL — so it can't ALTER away the audit triggers).
 *
 * Tenant isolation is enforced in application code (MariaDB has no RLS), so `ci_app`
 * is defense-in-depth, not the tenant boundary — see packages/db/src/scoped.ts.
 *
 *   pnpm db:setup        # idempotent; safe to re-run
 *
 * Reads the server location from MYSQL_ROOT_URL, else DATABASE_URL (db path ignored
 * for the server connection), else the XAMPP default (root, no password, :3306).
 */
import mysql from "mysql2/promise";

const ROOT_URL =
  process.env.MYSQL_ROOT_URL ?? process.env.DATABASE_URL ?? "mysql://root@localhost:3306/construction_intelligence";
const APP_PASSWORD = process.env.CI_APP_PASSWORD ?? "ci_app_local_dev";

function parse(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname || "localhost",
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username || "root"),
    password: decodeURIComponent(u.password || ""),
    database: u.pathname.replace(/^\//, "") || "construction_intelligence",
  };
}

async function main() {
  const cfg = parse(ROOT_URL);
  const db = cfg.database;
  // Connect to the SERVER (no default database — it may not exist yet).
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    multipleStatements: true,
  });

  // utf8mb4 with the SERVER DEFAULT collation (utf8mb4_general_ci on MariaDB 10.4).
  // Don't force a non-default collation: column collation must match the connection's
  // (so `col = @app_current_org` / app_current_org() comparisons don't hit an "illegal
  // mix of collations" error against the session user variable).
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4`);

  // The app user — both 'localhost' (socket/TCP loopback) and '%' (container/dev) hosts.
  for (const host of ["localhost", "%"]) {
    await conn.query(`CREATE USER IF NOT EXISTS 'ci_app'@'${host}' IDENTIFIED BY ?`, [APP_PASSWORD]);
    await conn.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${db}\`.* TO 'ci_app'@'${host}'`);
  }
  await conn.query("FLUSH PRIVILEGES");
  await conn.end();

  console.log(`MySQL setup complete:\n  database = ${db}\n  app user = ci_app (DML only)\n  owner    = ${cfg.user}@${cfg.host}:${cfg.port}\nRun \`pnpm db:migrate\` next.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
