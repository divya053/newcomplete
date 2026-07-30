import { randomUUID } from "node:crypto";
import { db, schema } from "@ci/db";
import { isPermission, type Permission } from "@ci/shared";
import { and, eq } from "drizzle-orm";
import { cookies, headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth";
import { UnauthorizedError } from "./errors";

/** Cookie holding the user's ACTIVE org (tenant). resolveContext keys on it. */
export const ACTIVE_ORG_COOKIE = "ci_active_org";

/**
 * The RequestContext every server action / handler resolves first. It carries the
 * authenticated identity, the active tenant, the resolved permission SET (from the
 * catalog, server-side), and the correlationId threaded across runtimes (ws 0.8).
 *
 * Authorization (permissions) and tenant-isolation (orgId → RLS) are DISTINCT axes
 * carried together here (guardrail #3).
 */
export interface RequestContext {
  userId: string;
  orgId: string;
  permissions: Set<Permission>;
  correlationId: string;
  isHost: boolean; // true when the active org is the platform owner (TechSME)
}

/**
 * Resolve the context from the live Better Auth session (ws 0.3): read the session
 * → find the user's membership → resolve the role's catalog permissions. Fail-closed:
 * no session, or a user with no membership, throws (never a fabricated grant).
 */
export async function resolveContext(): Promise<RequestContext> {
  const hdrs = await nextHeaders();
  const correlationId = hdrs.get("x-correlation-id") ?? randomUUID();

  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user) throw new UnauthorizedError();
  const userId = session.user.id;

  // A user may belong to several orgs. The ACTIVE org is chosen by the org switcher
  // (a cookie); we only ever pick from the user's OWN memberships, so the cookie can
  // never grant access to an org they don't belong to. Falls back to the first.
  const rows = await db
    .select({ orgId: schema.memberships.orgId, perms: schema.roles.permissions, isHost: schema.orgs.isHost })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(eq(schema.memberships.userId, userId));

  if (rows.length === 0) throw new UnauthorizedError("User has no org membership");

  const activeOrgId = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const m = rows.find((r) => r.orgId === activeOrgId) ?? rows[0];

  const permissions = new Set<Permission>(
    (m.perms ?? []).filter(isPermission), // only catalog permissions count (guardrail #3)
  );
  return { userId, orgId: m.orgId, permissions, correlationId, isHost: !!m.isHost };
}

/** The signed-in user's display identity (name + email) for the shell. */
export async function getUserIdentity(userId: string): Promise<{ name: string; email: string } | null> {
  const rows = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Every org the user belongs to (for the org switcher). */
export async function getUserOrgs(userId: string): Promise<{ orgId: string; orgName: string }[]> {
  return db
    .select({ orgId: schema.orgs.id, orgName: schema.orgs.name })
    .from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(eq(schema.memberships.userId, userId));
}

/** Active membership lookup used by the shell to show the org name. Null if none. */
export async function getActiveMembership(userId: string): Promise<{ orgId: string; orgName: string } | null> {
  const rows = await db
    .select({ orgId: schema.orgs.id, orgName: schema.orgs.name })
    .from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(eq(schema.memberships.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

void and; // (kept for future multi-org scoping)
