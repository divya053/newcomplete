"use client";

import { Button, Input, Select, Textarea } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createHostRoleAction, inviteHostUserAction } from "@/server/host";
import { Drawer, Field } from "./drawer";

interface RoleOpt { id: string; name: string }
interface CatGroup { category: string; keys: string[] }

export function InviteUserButton({ roles }: { roles: RoleOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [email, setEmail] = useState(""); const [roleName, setRoleName] = useState(roles[0]?.name ?? "");
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Invite user</Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Add host user" subtitle="Grant a TechSME staffer host access"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending || !email} onClick={() => { setErr(null); start(async () => { const r = await inviteHostUserAction({ email, roleName }); if (!r.ok) setErr(r.error); else { setOpen(false); setEmail(""); router.refresh(); } }); }}>Add user</Button></>}>
        {err && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}
        <Field label="Email" hint="The person must already have a Preckon account."><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="new.staff@techsme.com" /></Field>
        <Field label="Role"><Select value={roleName} onChange={(e) => setRoleName(e.target.value)}>{roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}</Select></Field>
      </Drawer>
    </>
  );
}

export function NewRoleButton({ catalog }: { catalog: CatGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState(""); const [desc, setDesc] = useState(""); const [keys, setKeys] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const toggle = (k: string) => setKeys((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return (
    <>
      <button onClick={() => setOpen(true)} className="text-primary hover:underline">+ New role</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="New role" subtitle="Custom host RBAC role"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending || !name} onClick={() => { setErr(null); start(async () => { const r = await createHostRoleAction({ name, description: desc, permissionKeys: [...keys] }); if (!r.ok) setErr(r.error); else { setOpen(false); router.refresh(); } }); }}>Create role</Button></>}>
        {err && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}
        <Field label="Role name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Onboarding specialist" /></Field>
        <Field label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Permissions</p>
        <div className="space-y-3">
          {catalog.map((g) => (
            <div key={g.category}>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{g.category}</p>
              <div className="grid grid-cols-2 gap-1">
                {g.keys.map((k) => (
                  <label key={k} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={keys.has(k)} onChange={() => toggle(k)} className="h-3.5 w-3.5 accent-[hsl(var(--color-primary))]" /><span className="font-mono text-[11px]">{k}</span></label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}
