import { audit, schema, withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { RemoveMemberInput } from "../model";

/**
 * Remove a member from the current org (delete their membership). Two safety guards:
 * you can't remove yourself (self-lockout), and you can't remove the LAST owner (it
 * would leave the org with no one who can administer it).
 *   validate -> authorize -> tenant-scope -> work -> audit
 */
export async function removeMember(ctx: RequestContext, raw: unknown) {
  const input = RemoveMemberInput.parse(raw); // 1. validate
  requirePermission(ctx, PERMISSIONS.ADMIN_MANAGE_USERS); // 2. authorize
  if (input.userId === ctx.userId) throw new ForbiddenError("cannot remove yourself");

  return withTenant(ctx.orgId, async (tx) => {
    // 3. tenant-scope
    const membership = (
      await tx
        .select({ id: schema.memberships.id, roleId: schema.memberships.roleId })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, input.userId)))
        .limit(1)
    )[0];
    if (!membership) throw new NotFoundError("membership");

    // Last-owner guard: don't strip the org of its only owner.
    const ownerRole = (
      await tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(and(eq(schema.roles.orgId, ctx.orgId), eq(schema.roles.name, "owner")))
        .limit(1)
    )[0];
    if (ownerRole && membership.roleId === ownerRole.id) {
      const owners = await tx
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.roleId, ownerRole.id)));
      if (owners.length <= 1) throw new ValidationError("can't remove the last owner — assign another owner first");
    }

    // 4. work
    await tx
      .delete(schema.memberships)
      .where(and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, input.userId)));

    // 5. audit
    await audit(tx, ctx, {
      action: "member.removed",
      entityType: "membership",
      entityId: membership.id,
      before: { userId: input.userId, roleId: membership.roleId },
    });

    return { removed: input.userId };
  });
}
