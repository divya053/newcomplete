import { Badge, type BadgeProps, cn } from "@ci/ui";
import type { ReactNode } from "react";

/**
 * Preckon host status language (mock §3): one mapping → the same colour/label for a
 * state everywhere. active/paid/published→teal, trial/open→blue, past-due/beta→amber,
 * suspended/failed→red, draft/expired/disabled→gray.
 */
const STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  active: { label: "Active", variant: "success" },
  paid: { label: "Paid", variant: "success" },
  published: { label: "Published", variant: "success" },
  operational: { label: "Operational", variant: "success" },
  connected: { label: "Connected", variant: "success" },
  verified: { label: "Verified", variant: "success" },
  trial: { label: "Trial", variant: "accent" },
  trialing: { label: "Trial", variant: "accent" },
  open: { label: "Open", variant: "accent" },
  invited: { label: "Invited", variant: "accent" },
  past_due: { label: "Past due", variant: "warning" },
  beta: { label: "Beta", variant: "warning" },
  pending: { label: "Pending", variant: "warning" },
  suspended: { label: "Suspended", variant: "destructive" },
  failed: { label: "Failed", variant: "destructive" },
  uncollectible: { label: "Uncollectible", variant: "destructive" },
  critical: { label: "Critical", variant: "destructive" },
  draft: { label: "Draft", variant: "secondary" },
  expired: { label: "Expired", variant: "secondary" },
  deprecated: { label: "Deprecated", variant: "secondary" },
  disabled: { label: "Disabled", variant: "secondary" },
  canceled: { label: "Canceled", variant: "secondary" },
  archived: { label: "Archived", variant: "secondary" },
};

export function StatusPill({ status, label, className }: { status: string; label?: string; className?: string }) {
  const s = STATUS[status] ?? { label: label ?? status, variant: "secondary" as const };
  return (
    <Badge variant={s.variant} className={cn("font-mono text-[10px] uppercase tracking-wide", className)}>
      <span aria-hidden className="text-[8px]">●</span>
      {label ?? s.label}
    </Badge>
  );
}

/** Monospace data span — every quantity, code, rate & total (mock design language). */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono tabular-nums", className)}>{children}</span>;
}

/** A titled panel — the mock's `.card` with a `.chead` (title + subtitle + action). */
export function Panel({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-border bg-card p-5 shadow-sm", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="font-display text-sm font-semibold">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 text-sm">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** KPI tile — big mono value + delta + label (mock `.kpi`). */
export function Kpi({ label, value, hint, delta }: { label: string; value: ReactNode; hint?: string; delta?: { dir: "up" | "down" | "flat"; text: string } }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        {delta && (
          <span className={cn("font-mono text-[11px]", delta.dir === "up" && "text-success", delta.dir === "down" && "text-destructive", delta.dir === "flat" && "text-muted-foreground")}>
            {delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "▬"} {delta.text}
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** LED status dot for the system strip. */
export function Led({ tone }: { tone: "ok" | "warn" | "bad" }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", tone === "ok" && "bg-success", tone === "warn" && "bg-warning", tone === "bad" && "bg-destructive")} aria-hidden />;
}
