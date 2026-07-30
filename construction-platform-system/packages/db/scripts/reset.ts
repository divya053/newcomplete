/** Dev-only: drop & recreate the app database, then re-migrate. Never run in prod. */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL ?? "mysql://root@localhost:3306/construction_intelligence";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("refusing to reset in production");
  const u = new URL(url);
  const dbName = u.pathname.replace(/^\//, "") || "construction_intelligence";

  // Connect to the SERVER (no default db) so we can drop the database itself.
  const conn = await mysql.createConnection({
    host: u.hostname || "localhost",
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username || "root"),
    password: decodeURIComponent(u.password || ""),
    multipleStatements: true,
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  // utf8mb4 + server-default collation (must match the connection's, see setup-mysql.ts).
  await conn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4`);
  // ci_app's database-level grants survive the drop and re-apply to the new db.
  await conn.end();
  console.log(`database \`${dbName}\` reset — run \`pnpm db:migrate\` next.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
