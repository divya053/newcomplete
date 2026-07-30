import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader } from "@ci/ui";
import { getMyPlan } from "@/domain/saas";
import { resolveContext } from "@/server/context";
import { ChangeEditionButton } from "./_components/change-edition-button";

/**
 * Plan & features — the tenant's subscription. Shows the current edition + its
 * features, and the editions they can upgrade/downgrade to (self-service).
 */
export default async function PlanPage() {
  const ctx = await resolveContext();

  if (ctx.isHost) {
    return (
      <div className="space-y-6">
        <PageHeader title="Plan & features" description="You're the platform host — manage editions & tenants in Platform." />
        <Card>
          <CardContent>
            <EmptyState title="Host org" hint="The host has all features. Use Administration → Platform to manage editions and tenant plans." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const { current, editions } = await getMyPlan(ctx);

  return (
    <div className="space-y-6">
      <PageHeader title="Plan & features" description="Your subscription — upgrade or downgrade anytime." />

      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent>
          {current ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{current.name}</span>
                <Badge>${current.price}/mo</Badge>
              </div>
              {current.description && <p className="text-sm text-muted-foreground">{current.description}</p>}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {current.features.map((f) => (
                  <Badge key={f.key} variant="secondary">
                    {f.name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title="No active plan" hint="Ask your platform host to assign an edition." />
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Available editions</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {editions.map((e) => (
            <Card key={e.id}>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle>{e.name}</CardTitle>
                <Badge>${e.price}/mo</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {e.description && <p className="text-sm text-muted-foreground">{e.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {e.features.map((f) => (
                    <Badge key={f.key} variant="outline">
                      {f.name}
                    </Badge>
                  ))}
                </div>
                {current?.id === e.id ? (
                  <Badge variant="secondary">Current plan</Badge>
                ) : (
                  <ChangeEditionButton editionId={e.id} editionName={e.name} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
