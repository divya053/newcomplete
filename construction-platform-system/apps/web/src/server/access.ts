"use server";

import { PERMISSIONS } from "@ci/shared";
import {
  addMember,
  assignMemberRole,
  createRole,
  CreateUserInput,
  deleteRole,
  removeMember,
  updateRole,
} from "@/domain/access";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/server/authz";
import { resolveContext } from "@/server/context";

/** Application/BFF edge for RBAC management — resolves context, delegates to the domain. */
export async function assignMemberRoleAction(input: { userId: string; roleId: string }) {
  const ctx = await resolveContext();
  return assignMemberRole(ctx, input);
}

/** Remove a member from the current org (validate + authorize + guards in the domain). */
export async function removeMemberAction(input: { userId: string }) {
  const ctx = await resolveContext();
  return removeMember(ctx, input);
}

/** Create a custom org role with catalog permissions (validate + authorize in the domain). */
export async function createRoleAction(input: { name: string; permissions: string[] }) {
  const ctx = await resolveContext();
  return createRole(ctx, input);
}

/** Replace a custom role's permission grants. */
export async function updateRoleAction(input: { roleId: string; permissions: string[] }) {
  const ctx = await resolveContext();
  return updateRole(ctx, input);
}

/** Delete a custom role (blocked for system roles / roles still in use). */
export async function deleteRoleAction(input: { roleId: string }) {
  const ctx = await resolveContext();
  return deleteRole(ctx, input);
}

/**
 * Admin "create user" — provisions a NEW global identity (Better Auth) and adds them
 * to the current org with a role. Authorized first (admin:manage_users), so we never
 * create an account for an unauthorized caller. Better Auth is called server-side; it
 * does NOT set a session cookie here (no nextCookies plugin), so the admin stays
 * logged in as themselves. The membership write + audit run in the domain.
 */
export async function createUserAction(input: { name: string; email: string; password: string; roleId: string }) {
  const ctx = await resolveContext();
  requirePermission(ctx, PERMISSIONS.ADMIN_MANAGE_USERS);
  const parsed = CreateUserInput.parse(input);

  let userId: string;
  try {
    const res = await auth.api.signUpEmail({
      body: { name: parsed.name, email: parsed.email, password: parsed.password },
    });
    userId = res.user.id;
  } catch {
    throw new Error("Could not create the account — that email may already be in use.");
  }

  await addMember(ctx, { userId, roleId: parsed.roleId });
  return { userId, email: parsed.email };
}
