import { randomUUID } from "node:crypto";
import { audit, schema, withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { AddMemberInput } from "../model";

/**
 * Add an existing user (global identity) to THIS org with a role. The identity is
 * created separately (Better Auth) — this is the tenant-scoped membership write.
 *   validate -> authorize -> tenant-scope -> work -> audit
 */
export async function addMember(ctx: RequestContext, raw: unknown) {
  const input = AddMemberInput.parse(raw); // 1. validate
  requirePermission(ctx, PERMISSIONS.ADMIN_MANAGE_USERS); // 2. authorize

  return withTenant(ctx.orgId, async (tx) => {
    // 3. tenant-scope: role must belong to this org
    const role = (
      await tx
        .select({ id: schema.roles.id, name: schema.roles.name })
        .from(schema.roles)
        .where(and(eq(schema.roles.orgId, ctx.orgId), eq(schema.roles.id, input.roleId)))
        .limit(1)
    )[0];
    if (!role) throw new NotFoundError("role");

    const existing = (
      await tx
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, input.userId)))
        .limit(1)
    )[0];
    if (existing) throw new ValidationError("user is already a member of this org");

    const membershipId = randomUUID();
    await tx.insert(schema.memberships).values({
      id: membershipId,
      orgId: ctx.orgId,
      userId: input.userId,
      roleId: input.roleId,
    });

    await audit(tx, ctx, {
      action: "member.added",
      entityType: "membership",
      entityId: membershipId,
      after: { userId: input.userId, roleId: input.roleId, roleName: role.name },
    });
    return { membershipId };
  });
}
