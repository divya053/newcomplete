"use client";

import { Badge, Input, cn } from "@ci/ui";
import { useState } from "react";
import { Mono } from "./primitives";

interface Row { id: string; action: string; entityType: string; entityId: string | null; createdAt: string; actor: string | null }

const CATS = ["all", "Impersonation", "Tenants", "Billing", "Product", "Users", "Operations"] as const;
const catOf = (action: string): string => {
  if (action.includes("impersonation")) return "Impersonation";
  if (/^tenant\./.test(action)) return "Tenants";
  if (/^(subscription|invoice|pricing|coupon|billing)/.test(action)) return "Billing";
  if (/^(edition|feature)/.test(action)) return "Product";
  if (/^(host_user|role)/.test(action)) return "Users";
  return "Operations";
};
const CAT_VARIANT: Record<string, "warning" | "accent" | "success" | "secondary" | "default"> = { Impersonation: "warning", Billing: "accent", Product: "success", Users: "accent", Tenants: "secondary", Operations: "default" };

export function AuditClient({ rows }: { rows: Row[] }) {
  const [cat, setCat] = useState<(typeof CATS)[number]>("all");
  const [q, setQ] = useState("");
  const filtered = rows.filter((r) => (cat === "all" || catOf(r.action) === cat) && (q === "" || `${r.action} ${r.actor ?? ""}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-lg bg-muted p-0.5">
          {CATS.map((s) => <button key={s} onClick={() => setCat(s)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", cat === s ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>{s === "all" ? "All" : s}</button>)}
        </div>
        <Input placeholder="Search the log…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground"><th className="px-4 py-2.5">Time</th><th className="px-4 py-2.5">Actor</th><th className="px-4 py-2.5">Event</th><th className="px-4 py-2.5">Target</th><th className="px-4 py-2.5 text-right">Entry</th></tr></thead>
          <tbody>
            {filtered.map((r) => {
              const c = catOf(r.action);
              return (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5"><Mono className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</Mono></td>
                  <td className="px-4 py-2.5">{r.actor ?? "System"}</td>
                  <td className="px-4 py-2.5"><Badge variant={CAT_VARIANT[c]} className="mr-2 font-mono text-[9px] uppercase">{c}</Badge><Mono className="text-xs">{r.action}</Mono></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.entityType}</td>
                  <td className="px-4 py-2.5 text-right"><Mono className="text-[11px] text-muted-foreground">{r.id.slice(0, 8)}…</Mono></td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No matching events.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Entries are append-only — they can't be edited or deleted, only exported.</p>
    </div>
  );
}
