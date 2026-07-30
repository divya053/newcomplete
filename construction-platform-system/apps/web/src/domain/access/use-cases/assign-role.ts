import { audit, schema, withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { AssignRoleInput } from "../model";

/**
 * Change a member's role — the full spine (a permission/role change is consequential,
 * so it's audited, guardrail #4):
 *   validate -> authorize -> tenant-scope -> work -> audit
 */
export async function assignMemberRole(ctx: RequestContext, raw: unknown) {
  const input = AssignRoleInput.parse(raw); // 1. validate
  requirePermission(ctx, PERMISSIONS.ROLE_MANAGE); // 2. authorize

  // Guard against self-lockout: you can't change your own role here.
  if (input.userId === ctx.userId) throw new ForbiddenError("cannot change your own role");

  return withTenant(ctx.orgId, async (tx) => {
    // 3. tenant-scope: the target role must belong to THIS org
    const role = (
      await tx
        .select({ id: schema.roles.id, name: schema.roles.name })
        .from(schema.roles)
        .where(and(eq(schema.roles.orgId, ctx.orgId), eq(schema.roles.id, input.roleId)))
        .limit(1)
    )[0];
    if (!role) throw new NotFoundError("role");

    const membership = (
      await tx
        .select({ id: schema.memberships.id, roleId: schema.memberships.roleId })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, input.userId)))
        .limit(1)
    )[0];
    if (!membership) throw new NotFoundError("membership");
    if (membership.roleId === input.roleId) throw new ValidationError("member already has that role");

    // 4. work
    await tx
      .update(schema.memberships)
      .set({ roleId: input.roleId })
      .where(and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, input.userId)));

    // 5. audit
    await audit(tx, ctx, {
      action: "member.role_changed",
      entityType: "membership",
      entityId: membership.id,
      before: { roleId: membership.roleId },
      after: { roleId: input.roleId, roleName: role.name },
    });

    return { membershipId: membership.id, roleId: input.roleId };
  });
}
