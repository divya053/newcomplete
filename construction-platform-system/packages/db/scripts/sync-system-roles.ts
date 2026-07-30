/**
 * Re-sync every org's SYSTEM roles to the current permission catalog
 * (@ci/shared SYSTEM_ROLE_PERMISSIONS). Run after the catalog grows — e.g. when a
 * new module adds permissions — so existing tenants' owner/admin/etc. roles pick up
 * the new grants (role permissions are a snapshot stored per-org at provision time).
 * Idempotent. Runs as the owner (DATABASE_URL). Only touches is_system='true' roles;
 * custom roles are left alone.
 *
 *   pnpm db:sync-roles
 */
import mysql from "mysql2/promise";
import { SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES } from "@ci/shared";

const url = process.env.DATABASE_URL ?? "mysql://root@localhost:3306/construction_intelligence";

async function main() {
  const conn = await mysql.createConnection({ uri: url });
  for (const role of SYSTEM_ROLES) {
    const perms = JSON.stringify([...SYSTEM_ROLE_PERMISSIONS[role]]);
    const [res] = await conn.query("UPDATE roles SET permissions = ? WHERE name = ? AND is_system = 'true'", [perms, role]);
    console.log(`· ${role}: ${(res as { affectedRows: number }).affectedRows} role row(s) → ${SYSTEM_ROLE_PERMISSIONS[role].length} perms`);
  }
  await conn.end();
  console.log("\nSystem roles re-synced to the current catalog.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
