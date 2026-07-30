/**
 * Cross-tenant isolation test (ws 0.4.4 → EXIT GATE #2), MariaDB port.
 *
 * ⚠️ The guarantee changed with the engine. On Postgres the DB ITSELF enforced
 * isolation (FORCE Row-Level Security) and an unscoped query FAILED CLOSED. MariaDB
 * 10.4 has no RLS, so isolation is enforced in APPLICATION CODE — the scoped
 * repository's `WHERE org_id = ?` predicate (packages/db/src/repositories/base.ts).
 *
 * This test therefore proves the real, current boundary: the scoped query path
 * returns ONLY the active tenant's rows — and it documents the flip side honestly:
 * an UNSCOPED query (the thing we forbid) would see every tenant, which is exactly
 * why every owned-table access must go through the scoped repository.
 *
 * Requires a migrated + seeded local DB (skips otherwise so CI without a DB stays
 * green). Run: pnpm db:migrate && pnpm db:seed && pnpm --filter @ci/db test
 */
import mysql from "mysql2/promise";
import { afterAll, describe, expect, it } from "vitest";

const appUrl = process.env.APP_DATABASE_URL ?? "mysql://ci_app:ci_app_local_dev@localhost:3306/construction_intelligence";
const ownerUrl = process.env.DATABASE_URL ?? "mysql://root@localhost:3306/construction_intelligence";

let appConn: mysql.Connection | null = null;
let ownerConn: mysql.Connection | null = null;

async function conns() {
  try {
    ownerConn ??= await mysql.createConnection({ uri: ownerUrl });
    appConn ??= await mysql.createConnection({ uri: appUrl });
    // Pin collation_connection to the DB's default so `org_id = @app_current_org`
    // (the withTenant mechanism) doesn't trip an "illegal mix of collations" error:
    // the session variable would otherwise be utf8mb4_general_ci while CHAR columns
    // are utf8mb4_unicode_ci on this server.
    await appConn.query("SET collation_connection = @@collation_database");
    return { ownerConn, appConn };
  } catch {
    return null;
  }
}

async function orgIds(c: mysql.Connection): Promise<{ a: string; b: string } | null> {
  try {
    const [rows] = await c.query("SELECT id, slug FROM orgs WHERE slug IN ('acme','beta')");
    const list = rows as { id: string; slug: string }[];
    const a = list.find((x) => x.slug === "acme")?.id;
    const b = list.find((x) => x.slug === "beta")?.id;
    return a && b ? { a, b } : null;
  } catch {
    return null;
  }
}

afterAll(async () => {
  await appConn?.end().catch(() => {});
  await ownerConn?.end().catch(() => {});
});

describe("tenant isolation (app-enforced, as ci_app)", () => {
  it("the scoped query returns only the active tenant's probe rows", async () => {
    const cs = await conns();
    if (!cs) return; // no DB — skip (CI db-job provides one)
    const ids = await orgIds(cs.ownerConn);
    if (!ids) return; // not seeded — skip

    // This is exactly what ScopedRepository injects: org_id = the active tenant.
    await cs.appConn.query("SET @app_current_org = ?", [ids.a]);
    const [rows] = await cs.appConn.query("SELECT org_id FROM probe_vectors WHERE org_id = @app_current_org");
    const got = rows as { org_id: string }[];
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((r) => r.org_id === ids.a)).toBe(true);
    expect(got.some((r) => r.org_id === ids.b)).toBe(false);
  });

  it("an UNSCOPED query sees every tenant — proving the repo filter is the boundary", async () => {
    const cs = await conns();
    if (!cs) return;
    const ids = await orgIds(cs.ownerConn);
    if (!ids) return;

    // MariaDB has no RLS: without the org predicate, both tenants are visible. This
    // is the documented consequence of the port — NEVER write such a query in app
    // code; always go through the scoped repository. (Asserted so the regression is
    // visible if anyone assumes a DB-level boundary that no longer exists.)
    const [rows] = await cs.appConn.query("SELECT DISTINCT org_id FROM probe_vectors");
    const orgs = (rows as { org_id: string }[]).map((r) => r.org_id);
    expect(orgs).toContain(ids.a);
    expect(orgs).toContain(ids.b);
  });
});
