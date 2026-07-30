import { cn } from "../lib/cn";

/** Initials avatar (no image dependency). Deterministic teal tint from the tokens. */
export function Avatar({ name, email, className }: { name?: string | null; email?: string | null; className?: string }) {
  const label = (name ?? email ?? "?").trim();
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || label[0]?.toUpperCase() || "?";
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary",
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}
