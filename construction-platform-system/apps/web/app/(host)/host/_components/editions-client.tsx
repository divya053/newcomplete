"use client";

import { Button, Input, Textarea } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createEditionAction, setEditionStatusAction } from "@/server/host";
import { Drawer, Field } from "./drawer";

export function NewEditionButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState(""); const [key, setKey] = useState(""); const [desc, setDesc] = useState(""); const [trial, setTrial] = useState(14);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New edition</Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="New edition" subtitle="A plan tenants can be on"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending || !name} onClick={() => { setErr(null); start(async () => { const r = await createEditionAction({ name, key: key || undefined, description: desc, trialDays: trial }); if (!r.ok) setErr(r.error); else { setOpen(false); router.refresh(); } }); }}>Save edition</Button></>}>
        {err && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Edition name" /></Field>
        <Field label="Key" hint="lowercase slug"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="edition-key" className="font-mono" /></Field>
        <Field label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What this plan is for" /></Field>
        <Field label="Trial length (days)"><Input type="number" value={trial} onChange={(e) => setTrial(Number(e.target.value))} className="font-mono" /></Field>
      </Drawer>
    </>
  );
}

export function StatusToggle({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = status === "published" ? "archived" : "published";
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await setEditionStatusAction(id, next as "published" | "archived"); router.refresh(); })}>
      {status === "published" ? "Archive" : "Publish"}
    </Button>
  );
}
