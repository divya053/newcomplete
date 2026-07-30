import { Badge, PageHeader } from "@ci/ui";
import { formatMinor, getPricing } from "@/domain/host";
import { CurrencySwitch, EditPricingButton, NewCouponButton } from "../_components/pricing-client";
import { Mono, Panel, StatusPill } from "../_components/primitives";

export const dynamic = "force-dynamic";

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ cur?: string }> }) {
  const { cur } = await searchParams;
  const currency = (cur ?? "USD").toUpperCase();
  const p = await getPricing(currency);

  return (
    <div className="space-y-6">
      <PageHeader title="Pricing" description="Plan price per edition (the sum of its included module prices) plus any usage rates. Set an explicit price to override the derived one." actions={<CurrencySwitch currencies={p.currencies.map((c) => ({ code: c.code }))} active={p.currency} />} />

      <div className="grid gap-4 md:grid-cols-3">
        {p.editions.map((e) => (
          <div key={e.id} className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h3 className="font-display text-lg font-semibold">{e.name}</h3>
            <div className="mt-2 font-mono text-3xl font-semibold">
              {e.monthly === null ? <span className="text-muted-foreground">Not priced</span> : formatMinor(e.monthly, currency)}
              {e.monthly !== null && <span className="text-sm text-muted-foreground"> /mo</span>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {e.monthly === null ? "No module prices set" : e.derived ? "Derived — sum of included module prices" : e.annual ? `${formatMinor(Math.round(e.annual / 12), currency)}/mo billed annually` : "Explicit plan price"}
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
              <span><Mono>{e.tenantCount}</Mono> tenants</span>
              <EditPricingButton editionId={e.id} currency={currency} monthly={e.monthly} annual={e.annual} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Usage rates" subtitle={`Metered per unit of work · ${currency}`}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground"><th className="py-2">Metered unit</th><th className="py-2 text-right">Rate</th></tr></thead>
            <tbody>
              {p.rates.map((r) => (
                <tr key={r.key} className="border-b border-border last:border-0">
                  <td className="py-2.5">{r.name} <span className="text-muted-foreground">(per {r.unit})</span></td>
                  <td className="py-2.5 text-right"><Mono>{formatMinor(r.amountMinor, currency)}</Mono></td>
                </tr>
              ))}
              {p.rates.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-muted-foreground">No usage rates set for {currency}.</td></tr>}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">Enterprise editions can be set to custom volume rates.</p>
        </Panel>

        <Panel title="Discounts & coupons" subtitle="Applied at subscription time" action={<NewCouponButton />}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground"><th className="py-2">Code</th><th className="py-2">Discount</th><th className="py-2">Status</th></tr></thead>
            <tbody>
              {p.coupons.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="py-2.5"><Badge variant="secondary" className="font-mono">{c.code}</Badge></td>
                  <td className="py-2.5"><Mono>{c.discountType === "percent" ? `${Number(c.percentOff)}% off` : formatMinor(Number(c.amountOffMinor ?? 0), c.currencyCode ?? "USD")}</Mono></td>
                  <td className="py-2.5"><StatusPill status={c.status} /></td>
                </tr>
              ))}
              {p.coupons.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No coupons.</td></tr>}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
