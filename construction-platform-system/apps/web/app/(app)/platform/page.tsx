import {
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
import { listEditions, listFeatures, listTenants } from "@/domain/saas";
import { resolveContext } from "@/server/context";
import { CreateEditionForm } from "./_components/create-edition-form";
import { TenantEditionSelect } from "./_components/tenant-edition-select";

/**
 * Platform admin (HOST only) — the TechSME control room: define editions (plans)
 * from priced features, and assign each tenant their edition.
 */
export default async function PlatformPage() {
  const ctx = await resolveContext();
  if (!ctx.isHost) {
    return (
      <div className="space-y-6">
        <PageHeader title="Platform" />
        <Card>
          <CardContent>
            <EmptyState title="Host only" hint="Switch to the platform host org (TechSME) to manage editions and tenants." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const [editions, features, tenants] = await Promise.all([listEditions(), listFeatures(), listTenants(ctx)]);
  const editionOpts = editions.map((e) => ({ id: e.id, name: e.name }));

  return (
    <div className="space-y-6">
      <PageHeader title="Platform" description="Host control — editions (plans) and tenant subscriptions." />

      {/* Editions */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Editions (plans)</CardTitle>
          <CreateEditionForm features={features.map((f) => ({ id: f.id, name: f.name, price: Number(f.monthlyPrice) }))} />
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {editions.map((e) => (
            <div key={e.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{e.name}</span>
                <Badge>${e.price}/mo</Badge>
              </div>
              {e.description && <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                {e.features.map((f) => (
                  <Badge key={f.key} variant="outline">
                    {f.name}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Tenants */}
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>Tenants</CardTitle>
          <Badge variant="secondary">{tenants.length}</Badge>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <EmptyState title="No tenants yet" hint="Tenants appear here as orgs register." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Current edition</TableHead>
                  <TableHead className="text-right">Assign edition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant={t.editionId ? "secondary" : "outline"}>{t.edition}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <TenantEditionSelect orgId={t.id} currentEditionId={t.editionId} editions={editionOpts} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
