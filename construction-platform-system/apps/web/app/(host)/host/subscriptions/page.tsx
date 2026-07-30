import { PageHeader } from "@ci/ui";
import { formatMinor, getBillingSummary, listInvoices, listSubscriptions } from "@/domain/host";
import { InvoiceRetry } from "../_components/invoice-actions";
import { Kpi, Mono, Panel, StatusPill } from "../_components/primitives";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const [summary, invoices, subs] = await Promise.all([getBillingSummary(), listInvoices(8), listSubscriptions()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions & billing" description="Plans, invoices and revenue across every tenant." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="MRR" value={formatMinor(summary.mrrMinor, "USD", { compact: true })} hint="active + past-due plans" />
        <Kpi label="ARR" value={formatMinor(summary.arrMinor, "USD", { compact: true })} hint="annualised" />
        <Kpi label="Usage revenue" value={formatMinor(summary.usageMinor, "USD", { compact: true })} hint="metered, this period" />
        <Kpi label="Outstanding" value={formatMinor(summary.outstandingMinor, "USD", { compact: true })} hint={`${summary.failedPayments} unpaid`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Recent invoices" subtitle="Current billing run">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground"><th className="py-2">Invoice</th><th className="py-2">Tenant</th><th className="py-2 text-right">Amount</th><th className="py-2">Status</th><th className="py-2 text-right">Action</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0">
                  <td className="py-2.5"><Mono className="text-xs">{i.number ?? i.id.slice(0, 8)}</Mono></td>
                  <td className="py-2.5">{i.tenant}</td>
                  <td className="py-2.5 text-right"><Mono>{formatMinor(i.total, i.currency)}</Mono></td>
                  <td className="py-2.5"><StatusPill status={i.status} /></td>
                  <td className="py-2.5 text-right"><InvoiceRetry id={i.id} status={i.status} /></td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No invoices yet.</td></tr>}
            </tbody>
          </table>
        </Panel>

        <Panel title="Billing health" subtitle="Collections & renewals">
          <ul className="space-y-3 text-sm">
            <Row label="Collected" value={formatMinor(summary.collectedMinor, "USD")} />
            <Row label="Upcoming renewals" value={String(summary.upcomingRenewals)} />
            <Row label="Failed payments" value={String(summary.failedPayments)} />
            <Row label="Trials ending (7d)" value={String(summary.trialsEnding)} />
          </ul>
        </Panel>
      </div>

      <Panel title="Subscriptions" subtitle="Edition, seats and billing per tenant">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground"><th className="py-2">Tenant</th><th className="py-2">Edition</th><th className="py-2 text-right">Seats</th><th className="py-2 text-right">Plan /mo</th><th className="py-2 text-right">Usage MTD</th><th className="py-2">Status</th><th className="py-2 text-right">Renews</th></tr></thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.orgId} className="border-b border-border last:border-0">
                <td className="py-2.5 font-medium">{s.tenant}</td>
                <td className="py-2.5 text-muted-foreground">{s.edition}</td>
                <td className="py-2.5 text-right"><Mono>{s.seats ?? "—"}</Mono></td>
                <td className="py-2.5 text-right"><Mono>{s.planMinor > 0 ? formatMinor(s.planMinor, s.currency) : "—"}</Mono></td>
                <td className="py-2.5 text-right"><Mono>{s.usageMinor > 0 ? formatMinor(s.usageMinor, s.currency) : "—"}</Mono></td>
                <td className="py-2.5"><StatusPill status={s.status} /></td>
                <td className="py-2.5 text-right"><Mono className="text-xs text-muted-foreground">{s.renews ? s.renews.toLocaleDateString() : "—"}</Mono></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <li className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><Mono>{value}</Mono></li>;
}
