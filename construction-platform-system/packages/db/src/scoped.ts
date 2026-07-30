import { sql } from "drizzle-orm";
import { db, type Db } from "./client";

/** A drizzle transaction handle scoped to one tenant. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * The ONLY way to touch tenant data (ws 0.4, guardrail #2). Opens a transaction and
 * runs `fn`; every read/write inside MUST go through the scoped repository, which
 * filters by `orgId`.
 *
 * ⚠️ MariaDB port — READ THIS. On Postgres this function set a transaction-local GUC
 * (`app.current_org`) and the DB itself enforced isolation via FORCE Row-Level
 * Security: a query without a tenant context FAILED CLOSED (returned an error, never
 * "all rows"). **MariaDB/MariaDB 10.4 has no Row-Level Security.** There is no DB
 * backstop here. Isolation is now ENFORCED IN APPLICATION CODE by the scoped
 * repository (repositories/base.ts), which injects `WHERE org_id = :orgId` on every
 * query. The session variable `@app_current_org` is still set below so the value is
 * available to triggers / future views and to make the tenant context explicit, but
 * it does NOT, by itself, restrict any query.
 *
 * The consequence: a raw `tx.select().from(table)` with no org filter WILL return
 * other tenants' rows. NEVER write a raw unscoped query against an owned table — go
 * through the scoped repository, always. (On Postgres this rule was belt-and-braces;
 * on MariaDB it is the only thing holding the tenant boundary.)
 */
export async function withTenant<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // Connection-scoped on the tx's connection; informational under app-enforced
    // isolation (no RLS to key on). Kept so the active tenant is explicit + auditable.
    await tx.execute(sql`SET @app_current_org = ${orgId}`);
    return fn(tx);
  });
}
