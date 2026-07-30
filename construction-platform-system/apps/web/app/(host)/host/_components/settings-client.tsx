"use client";

import { Button, Input, Select, Textarea } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleMaintenanceAction, updateSettingsAction } from "@/server/host";

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const save = (patch: Record<string, unknown>, ok = "Saved") => start(async () => { const r = await updateSettingsAction(patch); setMsg(r.ok ? ok : r.error); if (r.ok) router.refresh(); });
  return { pending, msg, save };
}

export function GeneralSettings({ values }: { values: Record<string, unknown> }) {
  const { pending, msg, save } = useSave();
  const [name, setName] = useState(String(values["general.platform_name"] ?? "Preckon"));
  const [email, setEmail] = useState(String(values["general.support_email"] ?? ""));
  const [theme, setTheme] = useState(String(values["general.default_tenant_theme"] ?? "system"));
  return (
    <div className="space-y-3">
      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Platform name</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Support email</span><Input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Default theme for new tenants</span><Select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></Select></label>
      <div className="flex items-center gap-3 pt-1"><Button size="sm" disabled={pending} onClick={() => save({ "general.platform_name": name, "general.support_email": email, "general.default_tenant_theme": theme })}>Save</Button>{msg && <span className="text-xs text-muted-foreground">{msg}</span>}</div>
    </div>
  );
}

export function SecuritySettings({ values }: { values: Record<string, unknown> }) {
  const { pending, msg, save } = useSave();
  const [twofa, setTwofa] = useState(!!values["security.require_2fa"]);
  const [sso, setSso] = useState(!!values["security.enforce_sso_enterprise"]);
  const [hours, setHours] = useState(Number(values["security.session_max_hours"] ?? 8));
  const [policy, setPolicy] = useState(String(values["security.password_policy"] ?? "strong"));
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={twofa} onChange={(e) => setTwofa(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--color-primary))]" /> Require 2FA for host users</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sso} onChange={(e) => setSso(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--color-primary))]" /> Enforce SSO for enterprise tenants</label>
      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Session length (hours)</span><Input type="number" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-32 font-mono" /></label>
      <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Password policy</span><Select value={policy} onChange={(e) => setPolicy(e.target.value)} className="w-40"><option value="standard">Standard</option><option value="strong">Strong</option></Select></label>
      <div className="flex items-center gap-3 pt-1"><Button size="sm" disabled={pending} onClick={() => save({ "security.require_2fa": twofa, "security.enforce_sso_enterprise": sso, "security.session_max_hours": hours, "security.password_policy": policy })}>Save</Button>{msg && <span className="text-xs text-muted-foreground">{msg}</span>}</div>
    </div>
  );
}

export function MaintenanceSettings({ values }: { values: Record<string, unknown> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(!!values["maintenance.enabled"]);
  const [message, setMessage] = useState(String(values["maintenance.message"] ?? ""));
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--color-warning))]" /> Maintenance mode — show a banner and pause new jobs platform-wide</label>
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message shown to tenants" />
      <div className="flex items-center gap-3"><Button size="sm" variant={enabled ? "destructive" : "outline"} disabled={pending} onClick={() => start(async () => { const r = await toggleMaintenanceAction(enabled, message); setMsg(r.ok ? "Saved" : r.error); if (r.ok) router.refresh(); })}>Save</Button>{msg && <span className="text-xs text-muted-foreground">{msg}</span>}</div>
    </div>
  );
}
