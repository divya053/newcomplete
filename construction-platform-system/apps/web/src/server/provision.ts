"use server";

import { randomUUID } from "node:crypto";
import { schema, withTenant } from "@ci/db";
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from "@ci/shared";
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Provision a personal org for the current user if they have none (ws 0.3/0.4).
 * Called right after sign-up: creates the tenant, copies the 5 system roles into
 * it, and makes the user its OWNER. Roles + membership are written under the tenant
 * context so RLS WITH CHECK passes (proving the scoped-write path end-to-end).
 */
export async function provisionOrgForCurrentUser(orgName: string): Promise<{ orgId: string } | { error: string }> {
  const hdrs = await nextHeaders();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user) return { error: "not authenticated" };
  const userId = session.user.id;

  const orgId = randomUUID();
  const slug = `${orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org"}-${orgId.slice(0, 8)}`;

  await withTenant(orgId, async (tx) => {
    // orgs has no RLS (it IS the tenant); roles/memberships are RLS-scoped to orgId.
    await tx.insert(schema.orgs).values({ id: orgId, name: orgName, slug });
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
    await tx.insert(schema.memberships).values({
      id: randomUUID(),
      orgId,
      userId,
      roleId: ownerRoleId,
    });
  });

  return { orgId };
}
