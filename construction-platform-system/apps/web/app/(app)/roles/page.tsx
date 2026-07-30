import {
  Avatar,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ci/ui";
import { PERMISSIONS } from "@ci/shared";
import { listRolesWithMembers, type MemberRow } from "@/domain/access";
import { resolveContext } from "@/server/context";
import { CreateRoleForm } from "./_components/create-role-form";
import { CreateUserForm } from "./_components/create-user-form";
import { RemoveMemberButton } from "./_components/remove-member-button";
import { RoleActions } from "./_components/role-actions";
import { RoleSelect } from "./_components/role-select";

/**
 * Roles & Members (RBAC management, exit gate #3). Shows each org role with its
 * catalog permissions and its members, and lets an admin reassign a member's role
 * — every change running the audited use-case spine. Gated by `role:manage`.
 */
export default async function RolesPage() {
  const ctx = await resolveContext();

  let data: Awaited<ReturnType<typeof listRolesWithMembers>> | null = null;
  try {
    data = await listRolesWithMembers(ctx);
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title="Roles & Members" description="Manage who can do what in your organization." />
        <Card>
          <CardContent>
            <EmptyState title="No access" hint="Your role can't manage roles (needs the role:manage permission)." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const { roles, members } = data;
  const roleOptions = roles.map((r) => ({ id: r.id, name: r.name }));
  const canManageUsers = ctx.permissions.has(PERMISSIONS.ADMIN_MANAGE_USERS);
  const byRole = new Map<string, MemberRow[]>();
  for (const m of members) {
    byRole.set(m.roleId, [...(byRole.get(m.roleId) ?? []), m]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Members"
        description={`${roles.length} roles · ${members.length} member${members.length === 1 ? "" : "s"} · permissions resolve server-side from the catalog`}
      />

      <CreateRoleForm />

      {canManageUsers && <CreateUserForm roles={roleOptions} />}

      <div className="space-y-4">
        {roles.map((role) => {
          const roleMembers = byRole.get(role.id) ?? [];
          return (
            <Card key={role.id}>
              <CardHeader className="flex-row items-center gap-2">
                <CardTitle className="capitalize">{role.name}</CardTitle>
                <Badge variant={role.isSystem ? "secondary" : "outline"}>{role.isSystem ? "system" : "custom"}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {roleMembers.length} member{roleMembers.length === 1 ? "" : "s"}
                </span>
                {!role.isSystem && <RoleActions roleId={role.id} permissions={role.permissions} />}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Permissions ({role.permissions.length})
                  </p>
                  {role.permissions.length === 0 ? (
                    <span className="text-sm text-muted-foreground">No permissions — read-only.</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {role.permissions.map((p) => (
                        <Badge key={p} variant="outline" className="font-mono">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {roleMembers.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roleMembers.map((m) => (
                        <TableRow key={m.membershipId}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar name={m.name} email={m.email} />
                              <span className="font-medium">
                                {m.name}
                                {m.userId === ctx.userId && (
                                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                                )}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{m.email}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-start justify-end gap-2">
                              <RoleSelect
                                userId={m.userId}
                                currentRoleId={m.roleId}
                                roles={roleOptions}
                                isSelf={m.userId === ctx.userId}
                              />
                              {canManageUsers && m.userId !== ctx.userId && (
                                <RemoveMemberButton userId={m.userId} name={m.name} />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
