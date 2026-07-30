"use client";

import { Select } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setTenantEditionAction } from "@/server/saas";

export function TenantEditionSelect({
  orgId,
  currentEditionId,
  editions,
}: {
  orgId: string;
  currentEditionId: string | null;
  editions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Select
      key={currentEditionId ?? "none"}
      className="h-8 w-56 text-xs"
      defaultValue={currentEditionId ?? ""}
      disabled={busy}
      onChange={async (e) => {
        const editionId = e.target.value;
        if (!editionId || editionId === currentEditionId) return;
        setBusy(true);
        try {
          await setTenantEditionAction({ orgId, editionId });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <option value="">— assign edition —</option>
      {editions.map((ed) => (
        <option key={ed.id} value={ed.id}>
          {ed.name}
        </option>
      ))}
    </Select>
  );
}
