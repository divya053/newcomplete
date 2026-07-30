"use client";

import { Button, Card, CardContent, Input, Select } from "@ci/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createUserAction } from "@/server/access";

/**
 * Admin "create user" — make a new account and drop them into this org with a role.
 * Self-registration would spin up a SEPARATE org; this adds people to YOUR org.
 */
export function CreateUserForm({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await createUserAction({ name, email, password, roleId });
      setDone(res.email);
      setName("");
      setEmail("");
      setPassword("");
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
              <p className="text-sm font-medium">Add a teammate</p>
              <p className="text-xs text-muted-foreground">
                Create a user account and add them to this organization with a role.
              </p>
            </div>
            <Button onClick={() => setOpen(true)}>Create user</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input
                placeholder="Temp password (8+ chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create user"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              {error && <span className="text-sm text-destructive">{error}</span>}
              {done && (
                <span className="text-sm text-primary">
                  Created {done} — share the temp password so they can sign in and change it.
                </span>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
