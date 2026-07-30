"use client";

import { Button, Input } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createOrgAction } from "@/server/tenancy";

/** Create a new organization and drop straight into it (the action switches the active tenant). */
export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createOrgAction({ name });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <Input
        placeholder="New organization name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="w-64"
      />
      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create organization"}
      </Button>
      {error && <span className="w-full text-sm text-destructive">{error}</span>}
    </form>
  );
}
