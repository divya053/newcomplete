"use client";

import { Button, Input } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createEditionAction } from "@/server/saas";

export function CreateEditionForm({ features }: { features: { id: string; name: string; price: number }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = features.filter((f) => picked.has(f.id)).reduce((s, f) => s + f.price, 0);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createEditionAction({ name, description: description || undefined, featureIds: [...picked] });
      setName("");
      setDescription("");
      setPicked(new Set());
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <Button onClick={() => setOpen(true)}>New edition</Button>;

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Edition name" value={name} onChange={(e) => setName(e.target.value)} required className="w-56" />
        <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="w-72" />
      </div>
      <div className="flex flex-wrap gap-2">
        {features.map((f) => (
          <label
            key={f.id}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${picked.has(f.id) ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
          >
            <input type="checkbox" checked={picked.has(f.id)} onChange={() => toggle(f.id)} className="accent-[hsl(var(--color-primary))]" />
            {f.name} <span className="text-muted-foreground">${f.price}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy || !name || picked.size === 0}>
          {busy ? "Creating…" : `Create edition · $${total}/mo`}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}
