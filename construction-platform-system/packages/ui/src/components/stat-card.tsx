import type { ReactNode } from "react";
import { cn } from "../lib/cn";

type Tone = "primary" | "accent" | "success" | "warning";

const toneTile: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
};

/** Compact metric tile for dashboards — value + label, optional icon tile + trend. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
  trend,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: Tone;
  /** e.g. { direction: "up", text: "12% vs last month" } */
  trend?: { direction: "up" | "down" | "flat"; text: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {icon && (
          <span className={cn("grid h-9 w-9 place-items-center rounded-lg transition-transform group-hover:scale-105", toneTile[tone])}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {trend && (
        <div
          className={cn(
            "mt-1 text-xs font-medium",
            trend.direction === "up" && "text-success",
            trend.direction === "down" && "text-destructive",
            trend.direction === "flat" && "text-muted-foreground",
          )}
        >
          {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "▬"} {trend.text}
        </div>
      )}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
