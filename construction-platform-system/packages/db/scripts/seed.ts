/**
 * Dev seed (ws 0.2 / 0.3), MariaDB port. Creates two tenants (A + B) each with the
 * 5 system roles, plus one probe row per tenant (embedding stored as a JSON array).
 * Users + memberships are created at REGISTER time by Better Auth + the register
 * action, not here. Runs as the owner (root / DATABASE_URL).
 */
import mysql from "mysql2/promise";
import { v7 as uuidv7 } from "uuid";
import { SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES } from "@ci/shared";

const url = process.env.DATABASE_URL ?? "mysql://root@localhost:3306/construction_intelligence";

type Conn = mysql.Connection;

async function seedOrg(conn: Conn, name: string, slug: string, vec: number[]) {
  const [existing] = await conn.query("SELECT id FROM orgs WHERE slug = ?", [slug]);
  const orgId = (existing as { id: string }[])[0]?.id ?? uuidv7();
  if (!(existing as { id: string }[])[0]) {
    await conn.query("INSERT INTO orgs(id,name,slug) VALUES (?,?,?)", [orgId, name, slug]);
  }
  for (const role of SYSTEM_ROLES) {
    // INSERT IGNORE = the (org_id, name) unique no-ops on re-seed (≈ ON CONFLICT DO NOTHING).
    await conn.query(
      "INSERT IGNORE INTO roles(id,org_id,name,is_system,permissions) VALUES (?,?,?,'true',?)",
      [uuidv7(), orgId, role, JSON.stringify(SYSTEM_ROLE_PERMISSIONS[role])],
    );
  }
  // One probe row per tenant; don't duplicate on re-seed.
  const [probe] = await conn.query("SELECT id FROM probe_vectors WHERE org_id = ? LIMIT 1", [orgId]);
  if (!(probe as { id: string }[])[0]) {
    await conn.query(
      "INSERT INTO probe_vectors(id,org_id,content,embedding) VALUES (?,?,?,?)",
      [uuidv7(), orgId, `${name} secret note`, JSON.stringify(vec)],
    );
  }
  return orgId;
}

async function main() {
  const conn = await mysql.createConnection({ uri: url });
  const a = Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0));
  const b = Array.from({ length: 1024 }, (_, i) => (i === 1 ? 1 : 0));
  const orgA = await seedOrg(conn, "Acme Construction", "acme", a);
  const orgB = await seedOrg(conn, "Beta Builders", "beta", b);
  await conn.end();
  console.log(`seeded:\n  orgA=${orgA} (acme)\n  orgB=${orgB} (beta)\n  probe_vectors=yes (embeddings as JSON)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
