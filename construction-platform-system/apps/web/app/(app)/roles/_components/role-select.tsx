"use client";

import { Select } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { assignMemberRoleAction } from "@/server/access";

/** Inline role picker for one member. Disabled for the current user (no self-edit). */
export function RoleSelect({
  userId,
  currentRoleId,
  roles,
  isSelf,
}: {
  userId: string;
  currentRoleId: string;
  roles: { id: string; name: string }[];
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(roleId: string) {
    if (roleId === currentRoleId) return;
    setBusy(true);
    setError(null);
    try {
      await assignMemberRoleAction({ userId, roleId });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        className="h-8 w-36 text-xs"
        defaultValue={currentRoleId}
        disabled={busy || isSelf}
        title={isSelf ? "You can't change your own role" : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
