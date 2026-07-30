import { PageHeader } from "@ci/ui";
import { getSettings } from "@/domain/host";
import { Mono, Panel, StatusPill } from "../_components/primitives";
import { GeneralSettings, MaintenanceSettings, SecuritySettings } from "../_components/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { settings, providers, domains } = await getSettings();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Host settings" description="Global configuration, security defaults, AI routing, email and maintenance." />

      <Panel title="General" subtitle="Platform identity"><GeneralSettings values={settings} /></Panel>

      <Panel title="AI providers & routing" subtitle="Provider-independent — no single vendor sees a whole project">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground"><th className="py-2">Provider</th><th className="py-2">Role</th><th className="py-2">API key</th><th className="py-2">Status</th></tr></thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="py-2.5 font-medium">{p.name}</td>
                <td className="py-2.5 capitalize text-muted-foreground">{p.role}</td>
                <td className="py-2.5"><Mono className="text-xs text-muted-foreground">{p.apiKeySecretRef}</Mono></td>
                <td className="py-2.5"><StatusPill status="connected" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">Keys are stored as secret-manager references (never plaintext).</p>
      </Panel>

      <Panel title="Email" subtitle={`Provider: ${String(settings["email.provider"] ?? "resend")} · from ${String(settings["email.from_address"] ?? "")}`}>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground"><th className="py-2">Domain</th><th className="py-2">DNS</th><th className="py-2">Status</th></tr></thead>
          <tbody>
            {domains.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0">
                <td className="py-2.5"><Mono>{d.domain}</Mono></td>
                <td className="py-2.5 text-muted-foreground">SPF · DKIM · DMARC</td>
                <td className="py-2.5"><StatusPill status={d.status} /></td>
              </tr>
            ))}
            {domains.length === 0 && <tr><td colSpan={3} className="py-4 text-muted-foreground">No sending domains configured.</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Panel title="Security defaults"><SecuritySettings values={settings} /></Panel>
      <Panel title="Maintenance mode"><MaintenanceSettings values={settings} /></Panel>
    </div>
  );
}
