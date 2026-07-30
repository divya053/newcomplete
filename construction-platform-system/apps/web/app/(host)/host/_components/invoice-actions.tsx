"use client";

import { Button } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { retryInvoiceAction } from "@/server/host";

export function InvoiceRetry({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (status === "paid") return <span className="text-xs text-muted-foreground">View</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await retryInvoiceAction(id); if (!r.ok) setErr(r.error); else router.refresh(); })}>
        {pending ? "…" : "Retry"}
      </Button>
      {err && <span className="text-[11px] text-destructive">{err}</span>}
    </span>
  );
}
