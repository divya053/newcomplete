import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Empty / Loading / Error states are FIRST-CLASS (ws 0.9) — every screen handles
 * them, not just the happy path. These are the canonical three.
 */
export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 p-8 text-muted-foreground", className)}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", detail }: { title?: string; detail?: string }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      <p className="font-medium">{title}</p>
      {detail && <p className="mt-1 opacity-80">{detail}</p>}
    </div>
  );
}
