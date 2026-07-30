"use client";

import { Button } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { changeEditionAction } from "@/server/saas";

export function ChangeEditionButton({ editionId, editionName }: { editionId: string; editionName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await changeEditionAction(editionId);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Switching…" : `Switch to ${editionName}`}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
