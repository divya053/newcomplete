"use client";

import { Button, Input, cn } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCouponAction, setEditionPriceAction } from "@/server/host";
import { Drawer, Field } from "./drawer";

export function CurrencySwitch({ currencies, active }: { currencies: { code: string }[]; active: string }) {
  const router = useRouter();
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5">
      {currencies.map((c) => (
        <button key={c.code} onClick={() => router.push(`/host/pricing?cur=${c.code}`)} className={cn("rounded-md px-3 py-1.5 font-mono text-xs font-medium", active === c.code ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>{c.code}</button>
      ))}
    </div>
  );
}

export function EditPricingButton({ editionId, currency, monthly, annual }: { editionId: string; currency: string; monthly: number | null; annual: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [m, setM] = useState((monthly ?? 0) / 100);
  const [a, setA] = useState((annual ?? 0) / 100);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit pricing</Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Edit pricing" subtitle={`${currency} · per seat / month`}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending} onClick={() => { setErr(null); start(async () => { const r = await setEditionPriceAction(editionId, currency, Math.round(m * 100), Math.round(a * 100)); if (!r.ok) setErr(r.error); else { setOpen(false); router.refresh(); } }); }}>Save pricing</Button></>}>
        {err && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}
        <Field label={`Monthly / seat (${currency})`}><Input type="number" value={m} onChange={(e) => setM(Number(e.target.value))} className="font-mono" /></Field>
        <Field label={`Annual / seat (${currency})`}><Input type="number" value={a} onChange={(e) => setA(Number(e.target.value))} className="font-mono" /></Field>
      </Drawer>
    </>
  );
}

export function NewCouponButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [code, setCode] = useState(""); const [pct, setPct] = useState(20);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button onClick={() => setOpen(true)} className="text-primary hover:underline">+ New</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="New coupon" subtitle="Percentage discount"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending || !code} onClick={() => { setErr(null); start(async () => { const r = await createCouponAction({ code, percentOff: pct }); if (!r.ok) setErr(r.error); else { setOpen(false); router.refresh(); } }); }}>Create coupon</Button></>}>
        {err && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}
        <Field label="Code"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono" placeholder="LAUNCH20" /></Field>
        <Field label="Percent off"><Input type="number" value={pct} onChange={(e) => setPct(Number(e.target.value))} className="font-mono" /></Field>
      </Drawer>
    </>
  );
}
