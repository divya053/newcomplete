import { betterAuth } from "better-auth";
import { createPool, type Pool } from "mysql2/promise";
import { env } from "./env";

// Cache the Better Auth pool across Next.js dev hot-reload (same reasoning as
// packages/db/client.ts): a fresh createPool() per recompile leaks sockets and
// trips MariaDB's "Too many connections". Reuse one pool across reloads.
const globalForAuth = globalThis as unknown as { __ciAuthPool?: Pool };
const authPool =
  globalForAuth.__ciAuthPool ?? createPool({ uri: env.DATABASE_URL, connectionLimit: 5, idleTimeout: 60_000 });
if (process.env.NODE_ENV !== "production") globalForAuth.__ciAuthPool = authPool;

/**
 * Better Auth (ws 0.3) — email + password, server-side sessions, on the MariaDB
 * (mysql2) adapter. Uses the OWNER connection (DATABASE_URL): the identity tables
 * (`user`, `session`, `account`, `verification`) are GLOBAL (no org_id), so they sit
 * outside the tenant-scoped path. Authorization (permissions) is a SEPARATE axis,
 * resolved per-request in resolveContext from the membership → role → catalog.
 *
 * Better Auth detects the mysql2 Pool and emits MySQL-dialect SQL; the tables are
 * created by migration 0001_auth.sql (camelCase columns, as the adapter expects).
 */
export const auth = betterAuth({
  database: authPool,
  secret: env.AUTH_SECRET,
  baseURL: env.AUTH_BASE_URL,
  // The browser client appends `currentURL=window.location.href` to every request and
  // Better Auth validates it (plus the Origin CSRF header) against trustedOrigins,
  // which otherwise defaults to ONLY baseURL. In local dev the app is reached on
  // various origins — a different port, 127.0.0.1, or the LAN/Network URL Next prints —
  // so we trust localhost + private-LAN origins (wildcards supported). Without this,
  // sign-in from any non-baseURL origin fails with "Invalid currentURL". Tighten to
  // the exact production origin(s) when deploying.
  // Better Auth validates the client-sent `currentURL` (+ the Origin CSRF header)
  // against trustedOrigins, which otherwise defaults to ONLY baseURL — so signing in
  // from any other origin (a different port, 127.0.0.1, the LAN/Network URL, IPv6…)
  // fails with 403 "Invalid currentURL". In local dev we trust every origin ("*"
  // matches any host); in production we lock to the configured base URL only.
  trustedOrigins: process.env.NODE_ENV === "production" ? [env.AUTH_BASE_URL] : ["*"],
  emailAndPassword: {
    enabled: true,
    // Phase 0 local dev: no email provider wired, so don't gate on verification.
    requireEmailVerification: false,
  },
});

export type Auth = typeof auth;
