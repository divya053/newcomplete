import { audit, schema, withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { DeleteRoleInput } from "../model";

/**
 * Delete a CUSTOM role. Refuses to delete a system role or a role that still has
 * members (you'd orphan their access) — reassign them first.
 *   validate -> authorize -> tenant-scope -> work -> audit
 */
export async function deleteRole(ctx: RequestContext, raw: unknown) {
  const input = DeleteRoleInput.parse(raw); // 1. validate
  requirePermission(ctx, PERMISSIONS.ROLE_MANAGE); // 2. authorize

  return withTenant(ctx.orgId, async (tx) => {
    // 3. tenant-scope
    const role = (
      await tx
        .select({ id: schema.roles.id, name: schema.roles.name, isSystem: schema.roles.isSystem, permissions: schema.roles.permissions })
        .from(schema.roles)
        .where(and(eq(schema.roles.orgId, ctx.orgId), eq(schema.roles.id, input.roleId)))
        .limit(1)
    )[0];
    if (!role) throw new NotFoundError("role");
    if (role.isSystem === "true") throw new ValidationError("system roles can't be deleted");

    const inUse = (
      await tx
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.roleId, input.roleId)))
        .limit(1)
    )[0];
    if (inUse) throw new ValidationError("reassign this role's members before deleting it");

    // 4. work
    await tx.delete(schema.roles).where(and(eq(schema.roles.orgId, ctx.orgId), eq(schema.roles.id, input.roleId)));

    // 5. audit
    await audit(tx, ctx, {
      action: "role.deleted",
      entityType: "role",
      entityId: input.roleId,
      before: { name: role.name, permissions: role.permissions ?? [] },
    });

    return { roleId: input.roleId };
  });
}
