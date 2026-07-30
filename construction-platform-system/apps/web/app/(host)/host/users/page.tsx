import { HOST_PERMISSION_CATALOG } from "@ci/shared";
import { Avatar, Badge, PageHeader } from "@ci/ui";
import { listHostRoles, listHostUsers } from "@/domain/host";
import { resolveHostContext } from "@/server/host-context";
import { Mono, Panel } from "../_components/primitives";
import { InviteUserButton, NewRoleButton } from "../_components/users-client";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { owner: "Platform Admin", admin: "Admin", billing: "Billing / Finance", support: "Support", sales: "Sales" };

export default async function HostUsersPage() {
  const ctx = await resolveHostContext();
  const [members, roles] = await Promise.all([listHostUsers(ctx.orgId), listHostRoles(ctx.orgId)]);
  const matrixRoles = roles.slice(0, 4);

  return (
    <div className="space-y-6">
      <PageHeader title="Host users & roles" description="Your internal staff and what each role can do." actions={<InviteUserButton roles={roles.map((r) => ({ id: r.id, name: r.name }))} />} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground"><th className="px-4 py-2.5">User</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5">Access</th><th className="px-4 py-2.5 text-right">Since</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><Avatar name={m.name} email={m.email} /><div><div className="font-medium">{m.name}</div><Mono className="text-[11px] text-muted-foreground">{m.email}</Mono></div></div></td>
                <td className="px-4 py-2.5"><Badge variant="secondary" className="font-mono text-[10px]">{ROLE_LABEL[m.role] ?? m.role}</Badge></td>
                <td className="px-4 py-2.5"><Badge variant="success" className="font-mono text-[10px]">Active</Badge></td>
                <td className="px-4 py-2.5 text-right"><Mono className="text-xs text-muted-foreground">{m.joinedAt.toLocaleDateString()}</Mono></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Panel title="Roles & permissions" subtitle="What each role grants" action={<NewRoleButton catalog={HOST_PERMISSION_CATALOG.map((g) => ({ category: g.category, keys: [...g.keys] }))} />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground">
                <th className="py-2 pr-3">Permission</th>
                {matrixRoles.map((r) => <th key={r.id} className="px-3 py-2 text-center">{ROLE_LABEL[r.name] ?? r.name}<div className="font-normal normal-case text-muted-foreground/70">{r.userCount} user{r.userCount === 1 ? "" : "s"}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {HOST_PERMISSION_CATALOG.map((g) => (
                <tr key={g.category} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 font-medium">{g.category}</td>
                  {matrixRoles.map((r) => {
                    const perms = (r.permissions ?? []) as string[];
                    const has = g.keys.filter((k) => perms.includes(k)).length;
                    return <td key={r.id} className="px-3 py-2 text-center">{has === g.keys.length ? <span className="text-success">✓</span> : has === 0 ? <span className="text-muted-foreground/40">✕</span> : <Mono className="text-xs text-muted-foreground">{has}/{g.keys.length}</Mono>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
