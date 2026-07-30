"use client";

import { Button, Input, Select, Textarea, cn } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markAllInboxReadAction, sendBroadcastAction } from "@/server/host";
import { Drawer, Field } from "./drawer";
import { Mono, StatusPill } from "./primitives";

interface Inbox { id: string; kind: string; severity: string; title: string; body: string | null; createdAt: string; read: boolean }
interface Sent { id: string; title: string; audienceType: string; deliverEmail: number; deliverInApp: number; recipients: number; sentAt: string | null }

export function NotificationsClient({ inbox, sent }: { inbox: Inbox[]; sent: Sent[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<{ title: string; body: string; audienceType: "all_tenants" | "by_edition" | "specific"; channel: "in_app" | "email" | "both" }>({ title: "", body: "", audienceType: "all_tenants", channel: "both" });
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {(["inbox", "sent"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-4 py-1.5 text-xs font-medium capitalize", tab === t ? "bg-card shadow-sm" : "text-muted-foreground")}>{t}</button>)}
        </div>
        <div className="flex gap-2">
          {tab === "inbox" && <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { await markAllInboxReadAction(); router.refresh(); })}>Mark all read</Button>}
          <Button size="sm" onClick={() => setOpen(true)}>+ New notification</Button>
        </div>
      </div>

      {tab === "inbox" ? (
        <ul className="space-y-2">
          {inbox.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 rounded-lg border border-border p-3", !n.read && "bg-primary/5")}>
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="font-medium">{n.title}</span><StatusPill status={n.severity === "critical" ? "critical" : n.severity === "warning" ? "past_due" : "open"} label={n.kind} /></div>
                {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
              </div>
              <Mono className="text-[11px] text-muted-foreground">{new Date(n.createdAt).toLocaleDateString()}</Mono>
            </li>
          ))}
          {inbox.length === 0 && <li className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">Inbox is empty.</li>}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground"><th className="px-4 py-2.5">Notification</th><th className="px-4 py-2.5">Audience</th><th className="px-4 py-2.5">Channel</th><th className="px-4 py-2.5 text-right">Sent</th><th className="px-4 py-2.5 text-right">Recipients</th></tr></thead>
            <tbody>
              {sent.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium">{s.title}</td>
                  <td className="px-4 py-2.5 capitalize text-muted-foreground">{s.audienceType.replace("_", " ")}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.deliverInApp && s.deliverEmail ? "In-app + Email" : s.deliverEmail ? "Email" : "In-app"}</td>
                  <td className="px-4 py-2.5 text-right"><Mono className="text-xs">{s.sentAt ? new Date(s.sentAt).toLocaleDateString() : "—"}</Mono></td>
                  <td className="px-4 py-2.5 text-right"><Mono>{s.recipients}</Mono></td>
                </tr>
              ))}
              {sent.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nothing sent yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={open} onClose={() => setOpen(false)} title="New notification" subtitle="Announce to tenants"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending || !form.title || !form.body} onClick={() => { setErr(null); start(async () => { const r = await sendBroadcastAction(form); if (!r.ok) setErr(r.error); else { setOpen(false); setForm({ ...form, title: "", body: "" }); router.refresh(); } }); }}>Send</Button></>}>
        {err && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}
        <Field label="Audience"><Select value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value as typeof form.audienceType })}><option value="all_tenants">All tenants</option><option value="by_edition">By edition</option><option value="specific">Specific</option></Select></Field>
        <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Scheduled maintenance Sunday 02:00 UTC" /></Field>
        <Field label="Message"><Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
        <Field label="Channel"><Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as typeof form.channel })}><option value="in_app">In-app</option><option value="email">Email</option><option value="both">Both</option></Select></Field>
      </Drawer>
    </div>
  );
}
