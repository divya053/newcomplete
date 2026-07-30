import { randomUUID } from "node:crypto";
import { audit, schema, withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { ValidationError } from "@/server/errors";
import { CreateRoleInput } from "../model";

/**
 * Create a custom org role. A role/permission change is consequential, so it runs
 * the full spine and is audited (guardrail #4):
 *   validate -> authorize -> tenant-scope -> work -> audit
 */
export async function createRole(ctx: RequestContext, raw: unknown) {
  const input = CreateRoleInput.parse(raw); // 1. validate (+ grants are catalog-only)
  requirePermission(ctx, PERMISSIONS.ROLE_MANAGE); // 2. authorize

  return withTenant(ctx.orgId, async (tx) => {
    // 3. tenant-scope: role names are unique within THIS org (uqOrgName)
    const existing = (
      await tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(and(eq(schema.roles.orgId, ctx.orgId), eq(schema.roles.name, input.name)))
        .limit(1)
    )[0];
    if (existing) throw new ValidationError("a role with that name already exists");

    // 4. work
    const roleId = randomUUID();
    await tx.insert(schema.roles).values({
      id: roleId,
      orgId: ctx.orgId,
      name: input.name,
      isSystem: "false",
      permissions: input.permissions,
    });

    // 5. audit
    await audit(tx, ctx, {
      action: "role.created",
      entityType: "role",
      entityId: roleId,
      after: { name: input.name, permissions: input.permissions },
    });

    return { roleId, name: input.name };
  });
}
