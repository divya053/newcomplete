"use client";

import { ALL_PERMISSIONS } from "@ci/shared";
import { useMemo } from "react";

/** Bucket a catalog permission into a friendly group by its module prefix. */
function groupOf(p: string): string {
  if (p.startsWith("tender:")) return "TenderLogix";
  if (p.startsWith("drawlogix:")) return "DrawLogix";
  return "Platform & Admin";
}

/**
 * Grouped catalog-permission checkbox grid, derived from @ci/shared (never ad-hoc
 * strings, guardrail #3) so it stays in sync as the catalog grows. Shared by the
 * create-role and edit-role forms — the design system owns this control once.
 */
export function PermissionPicker({
  selected,
  onToggle,
  onSetGroup,
}: {
  selected: Set<string>;
  onToggle: (p: string) => void;
  onSetGroup: (perms: string[], on: boolean) => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of ALL_PERMISSIONS) m.set(groupOf(p), [...(m.get(groupOf(p)) ?? []), p]);
    return [...m.entries()];
  }, []);

  return (
    <div className="space-y-4">
      {groups.map(([group, perms]) => {
        const allOn = perms.every((p) => selected.has(p));
        return (
          <div key={group} className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
              <button
                type="button"
                onClick={() => onSetGroup(perms, !allOn)}
                className="text-xs font-medium text-accent transition-colors hover:underline"
              >
                {allOn ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {perms.map((p) => {
                const on = selected.has(p);
                return (
                  <label
                    key={p}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-all ${
                      on ? "border-primary/40 bg-primary/10 text-primary" : "border-border hover:bg-muted"
                    }`}
                  >
                    <input type="checkbox" className="h-3.5 w-3.5 accent-current" checked={on} onChange={() => onToggle(p)} />
                    <span className="font-mono text-xs">{p}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
