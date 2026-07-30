"use client";

import { Badge, Button, Input, Select, cn } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createFeatureAction } from "@/server/host";
import { Drawer, Field } from "./drawer";
import { Mono, StatusPill } from "./primitives";

interface Feat { id: string; key: string; name: string; category: string; type: string; status: string; editions: { key: string | null; included: boolean }[] }
const CATS = ["all", "module", "capability", "limit", "usage"] as const;

export function FeaturesClient({ features }: { features: Feat[] }) {
  const router = useRouter();
  const [cat, setCat] = useState<(typeof CATS)[number]>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ key: "", name: "", category: "module", type: "flag", valueType: "boolean" });
  const [err, setErr] = useState<string | null>(null);

  const rows = features.filter((f) => (cat === "all" || f.category === cat) && (q === "" || `${f.name} ${f.key}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-muted p-0.5">
            {CATS.map((s) => <button key={s} onClick={() => setCat(s)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium capitalize", cat === s ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>{s === "all" ? "All" : `${s}s`}</button>)}
          </div>
          <Input placeholder="Search features…" value={q} onChange={(e) => setQ(e.target.value)} className="w-52" />
        </div>
        <Button onClick={() => setOpen(true)}>+ New feature</Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground"><th className="px-4 py-2.5">Feature</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Editions</th><th className="px-4 py-2.5">Status</th></tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-4 py-2.5"><div className="font-medium">{f.name}</div><Mono className="text-[11px] text-muted-foreground">{f.key}</Mono></td>
                <td className="px-4 py-2.5"><Badge variant={f.type === "flag" ? "default" : "accent"} className="font-mono text-[10px] uppercase">{f.type}</Badge></td>
                <td className="px-4 py-2.5">
                  <span className="flex gap-1">
                    {["starter", "professional", "enterprise"].map((ek) => {
                      const inc = f.editions.find((e) => e.key === ek)?.included;
                      return <span key={ek} className={cn("grid h-5 w-5 place-items-center rounded font-mono text-[10px] uppercase", inc ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/40")}>{ek[0]}</span>;
                    })}
                  </span>
                </td>
                <td className="px-4 py-2.5"><StatusPill status={f.status} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No features match.</td></tr>}
          </tbody>
        </table>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} title="New feature" subtitle="A flag, limit or metered unit"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending || !form.key || !form.name} onClick={() => { setErr(null); start(async () => { const r = await createFeatureAction(form); if (!r.ok) setErr(r.error); else { setOpen(false); router.refresh(); } }); }}>Save feature</Button></>}>
        {err && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="API access" /></Field>
        <Field label="Key" hint="lowercase dotted, e.g. capability.api_access"><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} className="font-mono" placeholder="capability.api_access" /></Field>
        <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="module">Module</option><option value="capability">Capability</option><option value="limit">Limit</option><option value="usage">Usage</option></Select></Field>
        <Field label="Type"><Select value={form.type} onChange={(e) => { const type = e.target.value; setForm({ ...form, type, valueType: type === "flag" ? "boolean" : "numeric" }); }}><option value="flag">Flag</option><option value="limit">Limit</option><option value="metric">Metric</option></Select></Field>
      </Drawer>
    </div>
  );
}
