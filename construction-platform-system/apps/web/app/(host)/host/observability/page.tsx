import { PageHeader } from "@ci/ui";
import { getObservability } from "@/domain/host";
import { JobActions } from "../_components/job-actions";
import { Led, Mono, Panel, StatusPill } from "../_components/primitives";

export const dynamic = "force-dynamic";

export default async function ObservabilityPage() {
  const o = await getObservability();

  return (
    <div className="space-y-6">
      <PageHeader title="Observability" description="Failed-job diagnostics (real) and AI provider routing. Live queue/throughput is a read-through over arq + Redis + Langfuse — not wired in this deployment." />

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 lg:grid-cols-4">
        <Tile led={o.totalFailures === 0 ? "ok" : "warn"} value={String(o.totalFailures)} label="Failed jobs (total)" hint="job_failure table" />
        <Tile led={o.unresolved > 0 ? "warn" : "ok"} value={String(o.unresolved)} label="Unresolved" hint="need triage" />
        <Tile led="warn" value="n/a" label="Queue depth" hint="arq/Redis not connected" />
        <Tile led="warn" value="n/a" label="Throughput" hint="Langfuse not connected" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Queue & workers" subtitle="Live read-through (arq + Redis)">
          <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
            <p className="text-sm text-muted-foreground">Not connected.</p>
            <p className="max-w-sm text-xs text-muted-foreground/70">Queue depth, worker heartbeats and latency percentiles are read live from arq/Redis in production (spec §10.1). Wire the facade to populate this panel.</p>
          </div>
        </Panel>

        <Panel title="AI provider routing" subtitle="Provider-independent (from ai_provider)">
          <ul className="space-y-2.5 text-sm">
            {o.providers.map((p) => (
              <li key={p.name} className="flex items-center justify-between">
                <span>{p.name} <span className="text-xs text-muted-foreground">· {p.role} · {p.kind}</span></span>
                <StatusPill status="active" label="Configured" />
              </li>
            ))}
            {o.providers.length === 0 && <li className="text-sm text-muted-foreground">No AI providers configured.</li>}
          </ul>
        </Panel>
      </div>

      <Panel title="Recent failed jobs" subtitle={`${o.unresolved} unresolved · from job_failure`}>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase text-muted-foreground"><th className="py-2">Time</th><th className="py-2">Tenant</th><th className="py-2">Job</th><th className="py-2">Error</th><th className="py-2 text-right">Action</th></tr></thead>
          <tbody>
            {o.failed.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-0">
                <td className="py-2.5"><Mono className="text-xs text-muted-foreground">{f.failedAt.toLocaleTimeString()}</Mono></td>
                <td className="py-2.5">{f.org ?? "—"}</td>
                <td className="py-2.5"><Mono className="text-xs">{f.jobType}</Mono></td>
                <td className="py-2.5"><StatusPill status={f.errorClass.includes("Timeout") ? "failed" : "past_due"} label={f.errorClass} /> <span className="text-xs text-muted-foreground">{f.errorMessage}</span></td>
                <td className="py-2.5 text-right"><JobActions id={f.id} resolved={!!f.resolved} /></td>
              </tr>
            ))}
            {o.failed.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No failed jobs. 🎉</td></tr>}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function Tile({ led, value, label, hint }: { led: "ok" | "warn" | "bad"; value: string; label: string; hint: string }) {
  return <div className="flex items-start gap-2.5"><span className="mt-1"><Led tone={led} /></span><div><div className="font-mono text-sm font-semibold">{value}</div><div className="text-xs font-medium">{label}</div><div className="text-[11px] text-muted-foreground">{hint}</div></div></div>;
}
