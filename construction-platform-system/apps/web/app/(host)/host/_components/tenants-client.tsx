"use client";

import { Button, Input, Select, cn } from "@ci/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { changeTenantEditionAction, impersonateAction, provisionTenantAction, restoreTenantAction, suspendTenantAction } from "@/server/host";
import { Drawer, Field } from "./drawer";
import { Mono, StatusPill } from "./primitives";

interface Tenant { id: string; name: string; slug: string; status: string; region: string; edition: string | null; seats: number | null; planMinor: number; usageMinor: number; contact: string | null }
interface Ed { id: string; name: string }

const money = (m: number) => (m > 0 ? `$${(m / 100).toLocaleString()}` : "—");
const STATUSES = ["all", "active", "trial", "past_due", "suspended"] as const;

export function TenantsClient({ tenants, editions }: { tenants: Tenant[]; editions: Ed[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>("all");
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = tenants.find((t) => t.id === openId) ?? null;
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tenants.length };
    for (const s of ["active", "trial", "past_due", "suspended"]) c[s] = tenants.filter((t) => t.status === s).length;
    return c;
  }, [tenants]);
  const rows = tenants.filter((t) => (filter === "all" || t.status === filter) && (q === "" || `${t.name} ${t.slug}`.toLowerCase().includes(q.toLowerCase())));

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, close = false) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) { setErr(r.error ?? "Action failed"); return; }
      if (close) { setShowNew(false); setOpenId(null); }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-muted p-0.5">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setFilter(s)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors", filter === s ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {s.replace("_", " ")} <span className="font-mono text-muted-foreground">{counts[s] ?? 0}</span>
              </button>
            ))}
          </div>
          <Input placeholder="Search tenants…" value={q} onChange={(e) => setQ(e.target.value)} className="w-52" />
        </div>
        <Button onClick={() => setShowNew(true)}>+ New tenant</Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5">Tenant</th><th className="px-4 py-2.5">Edition</th><th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Seats</th><th className="px-4 py-2.5 text-right">Usage MTD</th><th className="px-4 py-2.5 text-right">MRR</th><th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50" onClick={() => setOpenId(t.id)}>
                <td className="px-4 py-2.5"><div className="font-medium">{t.name}</div><div className="font-mono text-[11px] text-muted-foreground">{t.slug}</div></td>
                <td className="px-4 py-2.5 text-muted-foreground">{t.edition ?? "—"}</td>
                <td className="px-4 py-2.5"><StatusPill status={t.status} /></td>
                <td className="px-4 py-2.5 text-right"><Mono>{t.seats ?? "—"}</Mono></td>
                <td className="px-4 py-2.5 text-right"><Mono>{money(t.usageMinor)}</Mono></td>
                <td className="px-4 py-2.5 text-right"><Mono>{money(t.planMinor)}</Mono></td>
                <td className="px-4 py-2.5 text-right text-primary">Open →</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No tenants match.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      <Drawer open={!!selected} onClose={() => setOpenId(null)} title={selected?.name ?? ""} subtitle={selected ? selected.slug : ""}
        footer={selected && (
          <>
            {selected.status === "suspended" ? (
              <Button variant="outline" disabled={pending} onClick={() => act(() => restoreTenantAction(selected.id))}>Restore access</Button>
            ) : (
              <Button variant="destructive" disabled={pending} onClick={() => { const reason = prompt("Reason for suspension (audited):"); if (reason) act(() => suspendTenantAction(selected.id, reason)); }}>Suspend tenant</Button>
            )}
          </>
        )}
      >
        {selected && (
          <div className="space-y-4">
            {err && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Edition" value={selected.edition ?? "—"} />
              <Stat label="Status" value={<StatusPill status={selected.status} />} />
              <Stat label="Seats" value={<Mono>{selected.seats ?? "—"}</Mono>} />
              <Stat label="MRR" value={<Mono>{money(selected.planMinor)}</Mono>} />
              <Stat label="Usage MTD" value={<Mono>{money(selected.usageMinor)}</Mono>} />
              <Stat label="Region" value={<Mono>{selected.region}</Mono>} />
            </div>
            <div className="rounded-md border border-border px-3 py-2 text-sm"><span className="text-muted-foreground">Primary contact</span><div className="font-mono text-xs">{selected.contact ?? "—"}</div></div>

            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-muted-foreground">Actions</p>
              <Button className="w-full" disabled={pending} onClick={() => { const reason = prompt("Reason for impersonation (audited, read-only):"); if (reason) act(() => impersonateAction(selected.id, reason)); }}>Impersonate (audited)</Button>
              <div className="flex items-center gap-2">
                <Select className="flex-1" defaultValue="" id="edsel">
                  <option value="" disabled>Change edition…</option>
                  {editions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </Select>
                <Button variant="outline" disabled={pending} onClick={() => { const el = document.getElementById("edsel") as HTMLSelectElement; if (el?.value) act(() => changeTenantEditionAction(selected.id, el.value)); }}>Apply</Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* New tenant drawer */}
      <NewTenantDrawer open={showNew} onClose={() => setShowNew(false)} editions={editions} pending={pending} err={err} onSubmit={(input) => act(() => provisionTenantAction(input), true)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-md border border-border px-3 py-2"><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-0.5 text-sm font-medium">{value}</div></div>;
}

function NewTenantDrawer({ open, onClose, editions, pending, err, onSubmit }: { open: boolean; onClose: () => void; editions: Ed[]; pending: boolean; err: string | null; onSubmit: (i: { name: string; slug?: string; region: string; editionId: string; contact: string; startAs: "trial" | "active" }) => void }) {
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [region, setRegion] = useState("ca-central"); const [editionId, setEditionId] = useState(editions[0]?.id ?? ""); const [contact, setContact] = useState(""); const [trial, setTrial] = useState(true);
  return (
    <Drawer open={open} onClose={onClose} title="New tenant" subtitle="Provision a customer org"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={pending || !name || !editionId} onClick={() => onSubmit({ name, slug: slug || undefined, region, editionId, contact, startAs: trial ? "trial" : "active" })}>Create tenant</Button></>}>
      <div className="space-y-1">
        {err && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}
        <Field label="Company name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" /></Field>
        <Field label="Subdomain" hint={`${(slug || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "your-org"}.app`}><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="company-slug" className="font-mono" /></Field>
        <Field label="Edition"><Select value={editionId} onChange={(e) => setEditionId(e.target.value)}>{editions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
        <Field label="Region"><Select value={region} onChange={(e) => setRegion(e.target.value)}><option value="ca-central">ca-central</option><option value="us-east">us-east</option><option value="us-west">us-west</option><option value="uk">uk</option><option value="uae">uae</option></Select></Field>
        <Field label="Owner email"><Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="admin@company.com" type="email" /></Field>
        <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--color-primary))]" /> Start with a 14-day trial</label>
      </div>
    </Drawer>
  );
}
