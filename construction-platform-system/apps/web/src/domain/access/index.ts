// The ONLY import surface for the access (RBAC management) bounded context.
export { listRolesWithMembers } from "./use-cases/list-roles-members";
export { assignMemberRole } from "./use-cases/assign-role";
export { addMember } from "./use-cases/add-member";
export { removeMember } from "./use-cases/remove-member";
export { createRole } from "./use-cases/create-role";
export { updateRole } from "./use-cases/update-role";
export { deleteRole } from "./use-cases/delete-role";
export {
  AddMemberInput,
  AssignRoleInput,
  CreateRoleInput,
  CreateUserInput,
  DeleteRoleInput,
  RemoveMemberInput,
  UpdateRoleInput,
  type MemberRow,
  type RoleWithPermissions,
} from "./model";
