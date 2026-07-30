"use client";

import { Badge, Button, Card, CardContent, Input } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoleAction } from "@/server/access";
import { PermissionPicker } from "./permission-picker";

/**
 * Create a custom role — pick a name and the catalog permissions it grants. The
 * permission list is derived from @ci/shared (never ad-hoc strings, guardrail #3),
 * so it stays in sync as the catalog grows with each module.
 */
export function CreateRoleForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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

  function reset() {
    setOpen(false);
    setName("");
    setSelected(new Set());
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await createRoleAction({ name: name.trim(), permissions: [...selected] });
      setDone(res.name);
      reset();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="py-4">
        {!open ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Create a role</p>
              <p className="text-xs text-muted-foreground">
                Define a custom role and choose exactly which permissions it grants.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {done && <span className="text-sm text-success">Created “{done}”.</span>}
              <Button onClick={() => setOpen(true)}>Create role</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="role-name">
                  Role name
                </label>
                <Input
                  id="role-name"
                  placeholder="e.g. site-manager"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <Badge variant={selected.size ? "success" : "secondary"}>
                {selected.size} permission{selected.size === 1 ? "" : "s"} selected
              </Badge>
            </div>

            <PermissionPicker selected={selected} onToggle={toggle} onSetGroup={setGroup} />

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy || name.trim().length < 2}>
                {busy ? "Creating…" : "Create role"}
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>
                Cancel
              </Button>
              {error && <span className="text-sm text-destructive">{error}</span>}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
