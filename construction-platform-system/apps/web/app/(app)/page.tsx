import { db, schema } from "@ci/db";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, StatCard } from "@ci/ui";
import { and, count, eq, isNull } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import Link from "next/link";
import { listAuditLog } from "@/domain/audit";
import { getMyPlan, getOrgFeatures, listTenants } from "@/domain/saas";
import { getActiveMembership, getUserIdentity, resolveContext } from "@/server/context";

function fmt(d: Date) {
  return new Date(d).toISOString().replace("T", " ").slice(5, 16);
}

async function orgCount(table: MySqlTable & { orgId: any; archivedAt: any }, orgId: string) {
  const [r] = await db.select({ c: count() }).from(table).where(and(eq(table.orgId, orgId), isNull(table.archivedAt)));
  return r?.c ?? 0;
}

const BoqIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16v16H4z" /><path d="M4 9h16M9 9v11" /></svg>
);

export default async function DashboardPage() {
  const ctx = await resolveContext();
  const [features, me, membership] = await Promise.all([getOrgFeatures(ctx), getUserIdentity(ctx.userId), getActiveMembership(ctx.userId)]);
  const [tenderCount, plan, tenants, recent] = await Promise.all([
    orgCount(schema.tenderProjects, ctx.orgId),
    ctx.isHost ? Promise.resolve(null) : getMyPlan(ctx).then((p) => p.current),
    ctx.isHost ? listTenants(ctx) : Promise.resolve([]),
    listAuditLog(ctx, 7).catch(() => []),
  ]);

  const modules = [
    { key: "boq", href: "/tenderlogix", title: "TenderLogix", desc: "AI BOQ from CAD + tender docs", count: tenderCount, icon: BoqIcon },
  ].filter((m) => features.has(m.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${me?.name?.split(" ")[0] ?? "there"}`}
        description={`${membership?.orgName ?? "—"} · ${ctx.isHost ? "Platform host" : (plan?.name ?? "No plan")}`}
        actions={ctx.isHost ? <Badge>HOST</Badge> : plan ? <Badge>${plan.price}/mo</Badge> : undefined}
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tender projects" value={tenderCount} icon={BoqIcon} />
        <StatCard label="Features enabled" value={features.size} hint={ctx.isHost ? "host: all" : plan?.name} />
        {ctx.isHost ? (
          <StatCard label="Tenants" value={tenants.length} hint="across the platform" />
        ) : (
          <StatCard label="Active org" value={membership?.orgName?.split(" ")[0] ?? "—"} hint="current tenant" />
        )}
      </div>

      {/* Module launchers */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your modules</h2>
        {modules.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState title="No modules in your plan" hint="Visit Plan & features to upgrade." />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <Link
                key={m.key}
                href={m.href}
                className="group rounded-lg border border-border bg-background p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">{m.icon}</span>
                  <span className="text-xs text-muted-foreground">{m.count} projects</span>
                </div>
                <div className="mt-3 font-semibold">{m.title}</div>
                <p className="text-sm text-muted-foreground">{m.desc}</p>
                <span className="mt-2 inline-block text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Open →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Plan + recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>{ctx.isHost ? "Platform" : "Your plan"}</CardTitle>
            <Link href={ctx.isHost ? "/platform" : "/plan"} className="text-xs font-medium text-primary hover:underline">
              {ctx.isHost ? "Manage →" : "Upgrade →"}
            </Link>
          </CardHeader>
          <CardContent>
            {ctx.isHost ? (
              <p className="text-sm text-muted-foreground">
                You manage {tenants.length} tenant{tenants.length === 1 ? "" : "s"}, editions and features from the Platform console.
              </p>
            ) : plan ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{plan.name}</span>
                  <Badge>${plan.price}/mo</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {plan.features.map((f) => (
                    <Badge key={f.key} variant="secondary">
                      {f.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState title="No active plan" hint="Ask your host to assign an edition." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet — actions you take appear here.</p>
            ) : (
              <ul className="space-y-2">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="font-mono">
                      {r.action}
                    </Badge>
                    <span className="text-muted-foreground">{r.entityType}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">{fmt(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
