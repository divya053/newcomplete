import { PageHeader } from "@ci/ui";
import Link from "next/link";
import { formatMinor, getOverview } from "@/domain/host";
import { resolveHostContext } from "@/server/host-context";
import { Kpi, Led, Mono, Panel, StatusPill } from "./_components/primitives";

export const dynamic = "force-dynamic";

export default async function HostOverviewPage() {
  const ctx = await resolveHostContext();
  const o = await getOverview(ctx.orgId);
  const maxRev = Math.max(1, ...o.revenue.map((r) => r.planMinor + r.usageMinor));
  const totalStatus = Math.max(1, o.statusBreakdown.active + o.statusBreakdown.trial + o.statusBreakdown.pastDue + o.statusBreakdown.suspended);
  const pct = (n: number) => `${Math.round((n / totalStatus) * 100)}%`;

  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" description="How the platform is doing across every tenant." />

      {/* KPIs — all computed from live tables (no deltas: there's no historical
          baseline to compare against, so we don't fabricate a trend). */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Tenants" value={o.kpis.tenants} hint={`${o.kpis.active} active · ${o.kpis.trial} trial`} />
        <Kpi label="MRR" value={formatMinor(o.kpis.mrrMinor, "USD", { compact: true })} hint="plan subscriptions" />
        <Kpi label="Usage revenue" value={formatMinor(o.kpis.usageMinor, "USD", { compact: true })} hint="this month, metered" />
        <Kpi label="Active bids" value={o.kpis.activeBids} hint="live tender + drawing projects" />
        <Kpi label="Trials ending" value={o.kpis.trialsEnding} hint="tenants on trial" />
      </div>

      {/* Revenue + tenant status */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Revenue" subtitle="Plan vs usage, last 6 months (from invoices)">
          {o.hasRevenue ? (
            <>
              <div className="flex h-48 items-end gap-3 pt-2">
                {o.revenue.map((r) => (
                  <div key={r.month} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex w-full max-w-10 flex-1 flex-col justify-end">
                      <div className="w-full rounded-t-sm bg-primary/40" style={{ height: `${(r.usageMinor / maxRev) * 100}%` }} />
                      <div className="w-full bg-primary" style={{ height: `${(r.planMinor / maxRev) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{r.month}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Plan</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/40" /> Usage</span>
              </div>
            </>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm text-muted-foreground">No billing history yet.</p>
              <p className="text-xs text-muted-foreground/70">Revenue appears here once invoices are issued.</p>
            </div>
          )}
        </Panel>

        <Panel title="Tenant status" subtitle={`${o.kpis.tenants} tenants`}>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-success" style={{ width: pct(o.statusBreakdown.active) }} />
            <div className="bg-accent" style={{ width: pct(o.statusBreakdown.trial) }} />
            <div className="bg-warning" style={{ width: pct(o.statusBreakdown.pastDue) }} />
            <div className="bg-destructive" style={{ width: pct(o.statusBreakdown.suspended) }} />
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <StatusRow color="bg-success" label="Active" n={o.statusBreakdown.active} />
            <StatusRow color="bg-accent" label="Trial" n={o.statusBreakdown.trial} />
            <StatusRow color="bg-warning" label="Past due" n={o.statusBreakdown.pastDue} />
            <StatusRow color="bg-destructive" label="Suspended" n={o.statusBreakdown.suspended} />
          </ul>
        </Panel>
      </div>

      {/* Needs attention + activity */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Needs attention" subtitle="Trials ending and payment issues" action={<Link href="/host/tenants" className="text-primary hover:underline">All tenants →</Link>}>
          {o.needsAttention.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing needs attention right now.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {o.needsAttention.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="py-2.5">
                      <Link href={`/host/tenants?open=${t.id}`} className="font-medium hover:text-primary">{t.name}</Link>
                      <div className="font-mono text-[11px] text-muted-foreground">{t.slug}</div>
                    </td>
                    <td className="py-2.5 text-muted-foreground">{t.edition ?? "—"}</td>
                    <td className="py-2.5"><StatusPill status={t.status} /></td>
                    <td className="py-2.5 text-right"><Mono>{t.planMinor > 0 ? formatMinor(t.planMinor) : "—"}</Mono></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Recent activity" subtitle="Host actions, audited" action={<Link href="/host/audit" className="text-primary hover:underline">Audit →</Link>}>
          <ul className="space-y-3">
            {o.activity.length === 0 && <li className="text-sm text-muted-foreground">No host activity yet.</li>}
            {o.activity.map((a, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <div className="truncate"><Mono className="text-xs text-muted-foreground">{a.action}</Mono></div>
                  <div className="text-xs text-muted-foreground">{a.actor ?? "System"} · {a.createdAt.toLocaleString()}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* System status strip — real signals only. Queue depth / throughput come from
          a live arq+Redis read-through that isn't wired here, so they read "n/a". */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 lg:grid-cols-4">
        <SysTile led={o.system.unresolvedFailures > 0 ? "warn" : "ok"} value={String(o.system.unresolvedFailures)} label="Unresolved failed jobs" hint="from job_failure table" />
        <SysTile led={o.system.providers > 0 ? "ok" : "warn"} value={String(o.system.providers)} label="AI providers" hint="active, provider-independent" />
        <SysTile led="warn" value="n/a" label="Queue depth" hint="arq/Redis not connected" />
        <SysTile led="warn" value="n/a" label="Throughput" hint="arq/Redis not connected" />
      </div>
    </div>
  );
}

function StatusRow({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} /> {label}</span>
      <Mono className="text-muted-foreground">{n}</Mono>
    </li>
  );
}
function SysTile({ led, value, label, hint }: { led: "ok" | "warn" | "bad"; value: string; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-1"><Led tone={led} /></span>
      <div>
        <div className="font-mono text-sm font-semibold">{value}</div>
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
    </div>
  );
}
