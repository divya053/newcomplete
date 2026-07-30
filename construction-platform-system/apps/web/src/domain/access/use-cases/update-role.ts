import { audit, schema, withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { UpdateRoleInput } from "../model";

/**
 * Replace a CUSTOM role's permission grants. System roles are immutable (they're the
 * baseline every tenant relies on). A permission change is consequential → audited:
 *   validate -> authorize -> tenant-scope -> work -> audit
 */
export async function updateRole(ctx: RequestContext, raw: unknown) {
  const input = UpdateRoleInput.parse(raw); // 1. validate (+ grants are catalog-only)
  requirePermission(ctx, PERMISSIONS.ROLE_MANAGE); // 2. authorize

  return withTenant(ctx.orgId, async (tx) => {
    // 3. tenant-scope
    const role = (
      await tx
        .select({ id: schema.roles.id, isSystem: schema.roles.isSystem, permissions: schema.roles.permissions })
        .from(schema.roles)
        .where(and(eq(schema.roles.orgId, ctx.orgId), eq(schema.roles.id, input.roleId)))
        .limit(1)
    )[0];
    if (!role) throw new NotFoundError("role");
    if (role.isSystem === "true") throw new ValidationError("system roles can't be edited");

    // 4. work
    await tx
      .update(schema.roles)
      .set({ permissions: input.permissions })
      .where(and(eq(schema.roles.orgId, ctx.orgId), eq(schema.roles.id, input.roleId)));

    // 5. audit
    await audit(tx, ctx, {
      action: "role.updated",
      entityType: "role",
      entityId: input.roleId,
      before: { permissions: role.permissions ?? [] },
      after: { permissions: input.permissions },
    });

    return { roleId: input.roleId };
  });
}
