import { randomUUID } from "node:crypto";
import { db, schema } from "@ci/db";
import { type Permission, isPermission } from "@ci/shared";
import { eq } from "drizzle-orm";
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth";
import type { RequestContext } from "./context";
import { ForbiddenError, UnauthorizedError } from "./errors";

/**
 * Resolve the HOST-plane context (Preckon Host Console). Unlike resolveContext (which
 * keys on the tenant-app active-org cookie), the hardened /host area keys on the
 * caller's membership in the HOST org (orgs.is_host = 1) — so a TechSME staffer can
 * open /host regardless of whichever tenant workspace they last had active.
 *
 * Fail-closed: no session, or a user who is not a member of the host org, is denied.
 * Host RBAC = the host org role's catalog permissions (HOST_PERMISSIONS in @ci/shared).
 */
export async function resolveHostContext(): Promise<RequestContext> {
  const hdrs = await nextHeaders();
  const correlationId = hdrs.get("x-correlation-id") ?? randomUUID();

  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user) throw new UnauthorizedError();
  const userId = session.user.id;

  const rows = await db
    .select({ orgId: schema.memberships.orgId, perms: schema.roles.permissions, isHost: schema.orgs.isHost })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(eq(schema.memberships.userId, userId));

  const host = rows.find((r) => r.isHost);
  if (!host) throw new ForbiddenError("host staff only");

  const permissions = new Set<Permission>((host.perms ?? []).filter(isPermission));
  return { userId, orgId: host.orgId, permissions, correlationId, isHost: true };
}
