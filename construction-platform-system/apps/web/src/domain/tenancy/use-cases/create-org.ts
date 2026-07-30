import { randomUUID } from "node:crypto";
import { audit, schema, withTenant } from "@ci/db";
import { SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES } from "@ci/shared";
import type { RequestContext } from "@/server/context";
import { CreateOrgInput } from "../model";

/**
 * Create a NEW organization (tenant) owned by the current user. Creating a new tenant
 * is open to any authenticated user (it's their own org) — no in-org permission gate;
 * the act is still audited. The org gets the 5 system roles (from the CURRENT catalog,
 * so a new tenant is born with the full, up-to-date grants) and the creator becomes
 * its owner. Writes run under the NEW org's tenant context so scoping holds.
 *
 *   validate -> tenant-scope (the new org) -> work (org + roles + membership) -> audit
 */
export async function createOrg(ctx: RequestContext, raw: unknown) {
  const input = CreateOrgInput.parse(raw); // 1. validate
  const orgId = randomUUID();
  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org"}-${orgId.slice(0, 8)}`;

  await withTenant(orgId, async (tx) => {
    await tx.insert(schema.orgs).values({ id: orgId, name: input.name, slug });

    let ownerRoleId = "";
    for (const role of SYSTEM_ROLES) {
      const roleId = randomUUID();
      if (role === "owner") ownerRoleId = roleId;
      await tx.insert(schema.roles).values({
        id: roleId,
        orgId,
        name: role,
        isSystem: "true",
        permissions: [...SYSTEM_ROLE_PERMISSIONS[role]],
      });
    }
    await tx.insert(schema.memberships).values({ id: randomUUID(), orgId, userId: ctx.userId, roleId: ownerRoleId });

    // Audit row lands in the NEW org (its org_id), not the caller's current one.
    await audit(tx, { orgId, userId: ctx.userId, correlationId: ctx.correlationId }, {
      action: "org.created",
      entityType: "org",
      entityId: orgId,
      after: { name: input.name, slug },
    });
  });

  return { orgId };
}
