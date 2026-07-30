"use client";

import { Button } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveJobAction, retryJobAction } from "@/server/host";

export function JobActions({ id, resolved }: { id: string; resolved: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (resolved) return <span className="text-xs text-muted-foreground">Resolved</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await retryJobAction(id); if (!r.ok) setErr(r.error); else router.refresh(); })}>Retry</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => { const note = prompt("Resolution note:") ?? ""; start(async () => { const r = await resolveJobAction(id, note); if (!r.ok) setErr(r.error); else router.refresh(); }); }}>Resolve</Button>
      {err && <span className="text-[11px] text-destructive">{err}</span>}
    </span>
  );
}
