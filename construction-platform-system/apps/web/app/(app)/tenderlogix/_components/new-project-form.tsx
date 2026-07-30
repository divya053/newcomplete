"use client";

import { Button } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTenderProjectAction } from "@/server/tenderlogix";

/** Minimal create-project form — calls the server action, then refreshes the list. */
export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createTenderProjectAction({ name, client: client || undefined });
      setName("");
      setClient("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
      />
      <input
        value={client}
        onChange={(e) => setClient(e.target.value)}
        placeholder="Client (optional)"
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
      />
      <Button type="submit" disabled={busy}>
        {busy ? "…" : "New tender project"}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
