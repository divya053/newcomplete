import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@ci/ui";
import { getUserOrgs, resolveContext } from "@/server/context";
import { CreateOrgForm } from "./_components/create-org-form";

/**
 * Organizations (tenants). Each org is an isolated tenant; a user can belong to
 * several and switch between them from the top bar. Creating one makes you its
 * owner with the full system roles, and switches you straight into it.
 */
export default async function OrganizationsPage() {
  const ctx = await resolveContext();
  const orgs = await getUserOrgs(ctx.userId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        description="The tenants you belong to. Create a new one here, or switch the active org from the top bar."
      />

      <Card>
        <CardHeader>
          <CardTitle>Create organization</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateOrgForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your organizations ({orgs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {orgs.map((o) => (
              <li key={o.orgId} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">{o.orgName}</span>
                {o.orgId === ctx.orgId ? (
                  <Badge>active</Badge>
                ) : (
                  <span className="font-mono text-xs text-muted-foreground">{o.orgId.slice(0, 8)}…</span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
