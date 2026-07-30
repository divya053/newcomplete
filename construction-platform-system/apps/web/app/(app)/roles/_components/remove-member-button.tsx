"use client";

import { Button } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeMemberAction } from "@/server/access";

/** Remove a member from the org. Hidden for the current user (no self-removal). */
export function RemoveMemberButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Remove ${name} from this organization?`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeMemberAction({ userId });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="ghost" onClick={remove} disabled={busy} title="Remove member" className="text-destructive hover:bg-destructive/10">
        Remove
      </Button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
