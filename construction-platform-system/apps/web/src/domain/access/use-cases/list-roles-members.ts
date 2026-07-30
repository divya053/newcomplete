import { schema, withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { asc, eq } from "drizzle-orm";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import type { MemberRow, RoleWithPermissions } from "../model";

/**
 * The data behind the Roles & Members screen: the org's roles (with their catalog
 * permissions) and the members, each tied to their current role. Authorize +
 * tenant-scope (a read needs no audit row).
 */
export async function listRolesWithMembers(
  ctx: RequestContext,
): Promise<{ roles: RoleWithPermissions[]; members: MemberRow[] }> {
  requirePermission(ctx, PERMISSIONS.ROLE_MANAGE); // 2. authorize

  return withTenant(ctx.orgId, async (tx) => {
    // 3. tenant-scope: roles are per-org
    const roleRows = await tx
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.orgId, ctx.orgId))
      .orderBy(asc(schema.roles.name));

    const memberRows = await tx
      .select({
        membershipId: schema.memberships.id,
        userId: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        roleId: schema.memberships.roleId,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.orgId, ctx.orgId));

    const roles: RoleWithPermissions[] = roleRows.map((r) => ({
      id: r.id,
      name: r.name,
      isSystem: r.isSystem === "true",
      permissions: r.permissions ?? [],
    }));

    return { roles, members: memberRows };
  });
}
