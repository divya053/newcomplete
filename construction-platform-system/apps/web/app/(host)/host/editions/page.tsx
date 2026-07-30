import { PageHeader, cn } from "@ci/ui";
import Link from "next/link";
import { Fragment } from "react";
import { getEditionMatrix, listHostEditions } from "@/domain/host";
import { NewEditionButton, StatusToggle } from "../_components/editions-client";
import { Mono, Panel, StatusPill } from "../_components/primitives";

export const dynamic = "force-dynamic";

const CAT_LABEL: Record<string, string> = { module: "Modules", capability: "Capabilities", limit: "Limits", usage: "Usage" };

export default async function EditionsPage() {
  const [editions, matrix] = await Promise.all([listHostEditions(), getEditionMatrix()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Editions" description="The plans tenants can be on. Pick what each includes, then price it." actions={<NewEditionButton />} />

      <div className="grid gap-4 md:grid-cols-3">
        {editions.map((e) => (
          <div key={e.id} className={cn("rounded-lg border bg-card p-5 shadow-sm", e.key === "professional" ? "border-primary shadow-[0_0_0_1px_hsl(var(--color-primary)/0.3)]" : "border-border")}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{e.name}</h3>
              <StatusPill status={e.status} />
            </div>
            <p className="mt-1 min-h-10 text-sm text-muted-foreground">{e.description}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
              <Meta value={e.moduleCount} label="modules" />
              <Meta value={e.seatCap === null ? "∞" : e.seatCap === 0 ? "—" : e.seatCap} label="seats" />
              <Meta value={e.tenantCount} label="tenants" />
            </div>
            <div className="mt-4 flex gap-2">
              <StatusToggle id={e.id} status={e.status} />
              <Link href="/host/pricing" className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Pricing</Link>
            </div>
          </div>
        ))}
      </div>

      <Panel title="What each edition includes" subtitle="Feature × edition matrix" action={<Link href="/host/features" className="text-primary hover:underline">Manage features →</Link>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground">
                <th className="py-2 pr-3">Feature</th>
                {matrix.editions.map((e) => <th key={e.id} className="px-3 py-2 text-center">{e.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.groups.map((g) => (
                <Fragment key={g.category}>
                  <tr><td colSpan={matrix.editions.length + 1} className="pt-4 pb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{CAT_LABEL[g.category] ?? g.category}</td></tr>
                  {g.features.map((f) => (
                    <tr key={f.key} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3"><div className="font-medium">{f.name}</div><Mono className="text-[10px] text-muted-foreground">{f.key}</Mono></td>
                      {f.cells.map((c) => (
                        <td key={c.editionId} className="px-3 py-2 text-center">
                          {c.enumValue ? <span className="capitalize">{c.enumValue}</span> : c.enabled ? (f.type === "flag" ? <span className="text-success">✓</span> : <Mono>{c.limitValue === null ? "∞" : c.limitValue}</Mono>) : <span className="text-muted-foreground/40">✕</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Meta({ value, label }: { value: React.ReactNode; label: string }) {
  return <div><div className="font-mono text-lg font-semibold">{value}</div><div className="text-[10px] uppercase text-muted-foreground">{label}</div></div>;
}
