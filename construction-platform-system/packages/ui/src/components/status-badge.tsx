import { Badge, type BadgeProps } from "./badge";

/**
 * The artifact lifecycle, rendered consistently everywhere (ws 0.9, guardrail #8).
 * One mapping → every module shows the same colors/dots for the same state, so
 * feature #20 reads like feature #1. Keys match the lifecycle in CLAUDE.md.
 */
const LIFECYCLE: Record<string, { label: string; variant: BadgeProps["variant"]; dot: string }> = {
  ai_generated: { label: "AI Generated", variant: "default", dot: "✦" },
  draft: { label: "Draft", variant: "secondary", dot: "○" },
  under_review: { label: "Under Review", variant: "warning", dot: "●" },
  approved: { label: "Approved", variant: "accent", dot: "✓" },
  published: { label: "Published", variant: "success", dot: "●" },
  archived: { label: "Archived", variant: "outline", dot: "▣" },
  failed: { label: "Failed", variant: "destructive", dot: "✕" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = LIFECYCLE[status] ?? { label: status, variant: "secondary" as const, dot: "•" };
  return (
    <Badge variant={s.variant} className={className}>
      <span aria-hidden>{s.dot}</span>
      {s.label}
    </Badge>
  );
}
