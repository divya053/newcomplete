import { ALL_PERMISSIONS, isPermission } from "@ci/shared";
import { z } from "zod";

/**
 * Create a custom role for the org. Grants must reference the permission CATALOG
 * only (guardrail #3) — never an ad-hoc string. Names are normalized lower-case so
 * they don't collide case-only with the seeded system roles.
 */
export const CreateRoleInput = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9 _-]+$/i, "use letters, numbers, spaces, - or _")
    .transform((n) => n.toLowerCase()),
  permissions: z
    .array(z.string())
    .max(ALL_PERMISSIONS.length)
    .refine((perms) => perms.every(isPermission), "permission not in the catalog")
    .transform((perms) => Array.from(new Set(perms))),
});
export type CreateRoleInput = z.infer<typeof CreateRoleInput>;

/** Replace the permission grants of an existing CUSTOM role (catalog-only, guardrail #3). */
export const UpdateRoleInput = z.object({
  roleId: z.string().uuid(),
  permissions: z
    .array(z.string())
    .max(ALL_PERMISSIONS.length)
    .refine((perms) => perms.every(isPermission), "permission not in the catalog")
    .transform((perms) => Array.from(new Set(perms))),
});
export type UpdateRoleInput = z.infer<typeof UpdateRoleInput>;

/** Delete a custom role (blocked for system roles / roles still in use). */
export const DeleteRoleInput = z.object({ roleId: z.string().uuid() });
export type DeleteRoleInput = z.infer<typeof DeleteRoleInput>;

/** Remove a member (their membership) from the current org. */
export const RemoveMemberInput = z.object({ userId: z.string().min(1) });
export type RemoveMemberInput = z.infer<typeof RemoveMemberInput>;

/** Boundary input for changing a member's role (guardrail #6). */
export const AssignRoleInput = z.object({
  userId: z.string().min(1),
  roleId: z.string().uuid(),
});
export type AssignRoleInput = z.infer<typeof AssignRoleInput>;

/** Add an EXISTING identity to the current org with a role (membership). */
export const AddMemberInput = z.object({
  userId: z.string().min(1),
  roleId: z.string().uuid(),
});
export type AddMemberInput = z.infer<typeof AddMemberInput>;

/** Create a NEW user account AND add them to the org (the admin "create user" form). */
export const CreateUserInput = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  roleId: z.string().uuid(),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export interface RoleWithPermissions {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

export interface MemberRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  roleId: string;
}
