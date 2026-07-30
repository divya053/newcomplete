import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

/**
 * The pooled connection (MariaDB / XAMPP). The RUNNING APP connects as `ci_app`
 * (APP_DATABASE_URL) — a least-privilege user that has DML but not DDL, so it can't
 * ALTER away the audit-immutability triggers. Migrations run as root (DATABASE_URL).
 *
 * MariaDB port note: Postgres enforced tenant isolation in the DB via Row-Level
 * Security. MariaDB has no RLS, so isolation is enforced in the scoped repository
 * (app layer) — see scoped.ts. `ci_app` being a non-DDL user is still worthwhile
 * (it keeps the app from disabling the audit triggers), but it is NOT, on its own,
 * a tenant boundary the way Postgres FORCE RLS was.
 */
const connectionString =
  process.env.APP_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "mysql://ci_app:ci_app_local_dev@localhost:3306/construction_intelligence";

// `mode: "default"` = the standard MySQL protocol (not PlanetScale's HTTP driver).
// The scoped repository filters by BOUND PARAMETERS (collation-coercible), so the
// session collation doesn't affect tenant isolation here. (Code that instead compares
// a column to the `@app_current_org` session variable must first pin
// collation_connection to @@collation_database — see scoped.ts / isolation.test.ts.)
//
// SINGLETON across Next.js dev hot-reload: HMR re-evaluates this module on every
// edit. Without caching, each re-eval would `createPool()` again and leak the old
// pool's sockets, exhausting MariaDB's max_connections ("Too many connections").
// We stash the POOL on globalThis so every reload reuses the SAME sockets. (Only the
// pool holds connections; the drizzle() wrapper is stateless, so it's fine to rebuild.)
const globalForDb = globalThis as unknown as { __ciPool?: mysql.Pool };

export const pool =
  globalForDb.__ciPool ??
  mysql.createPool({
    uri: connectionString,
    // Bound so a runaway caller can't open hundreds of sockets. XAMPP/MariaDB
    // defaults to max_connections=151; stay well under it (other clients connect too).
    connectionLimit: 10,
    maxIdle: 4,
    idleTimeout: 60_000, // reclaim idle sockets after 60s
    queueLimit: 0, // queue requests rather than erroring when all 10 are busy
    enableKeepAlive: true,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__ciPool = pool;

export const db = drizzle(pool, { schema, mode: "default" });
export type Db = typeof db;
export { schema };
