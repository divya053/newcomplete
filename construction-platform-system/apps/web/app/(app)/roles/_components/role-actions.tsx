"use client";

import { Button } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteRoleAction, updateRoleAction } from "@/server/access";
import { PermissionPicker } from "./permission-picker";

/**
 * Edit (permissions) + delete controls for a CUSTOM role. System roles render
 * nothing — they're immutable. Editing opens the same grouped permission picker the
 * create form uses, pre-filled with the role's current grants.
 */
export function RoleActions({ roleId, permissions }: { roleId: string; permissions: string[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(permissions));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(p: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }
  function setGroup(perms: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of perms) on ? next.add(p) : next.delete(p);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateRoleAction({ roleId, permissions: [...selected] });
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this role? Members must be reassigned first.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteRoleAction({ roleId });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit permissions
        </Button>
        <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>
          Delete
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <PermissionPicker selected={selected} onToggle={toggle} onSetGroup={setGroup} />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save permissions"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelected(new Set(permissions));
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}
