"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PreckonLogo } from "@ci/ui";
import { signIn, signUp } from "@/lib/auth-client";
import { provisionOrgForCurrentUser } from "@/server/provision";

/**
 * Sign-in / register (ws 0.3). Styled to the Preckon auth mock — a navy card on a
 * teal-glow + blueprint-grid backdrop — but fully wired to Better Auth: sign in, or
 * register (which also provisions a personal org so the new user lands in the shell
 * with an owner role + the full permission catalog). Dark-first, like the mock.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const register = mode === "register";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (register) {
        const res = await signUp.email({ email, password, name: name || email });
        if (res.error) throw new Error(res.error.message ?? "Sign-up failed");
        const prov = await provisionOrgForCurrentUser(org || `${name || "My"} Org`);
        if ("error" in prov) throw new Error(prov.error);
      } else {
        const res = await signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message ?? "Sign-in failed");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dark relative grid min-h-screen place-items-center overflow-hidden bg-background p-6 text-foreground">
      {/* teal glow + blueprint grid backdrop (mock .login-wrap) */}
      <div aria-hidden className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(1200px 600px at 50% -10%, hsl(var(--color-primary) / 0.12), transparent 60%)" }} />
      <div aria-hidden className="bp-grid pointer-events-none fixed inset-0 opacity-40" />

      <div className="relative w-full max-w-[392px] rounded-2xl border border-border bg-card p-8 shadow-[0_40px_90px_-50px_rgba(0,0,0,0.7)]">
        {/* brand */}
        <div className="flex items-center gap-2.5">
          <PreckonLogo size={17} />
          <span className="ml-auto rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Platform</span>
        </div>

        <h1 className="mt-6 font-display text-[21px] font-semibold tracking-tight">{register ? "Create your account" : "Sign in"}</h1>
        <p className="mt-1 mb-6 text-[12.5px] text-muted-foreground">{register ? "Set up your organization workspace." : "Preconstruction intelligence — reviewed by your team."}</p>

        <form className="space-y-3.5" onSubmit={submit}>
          {register && (
            <Field label="Your name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Estimator" className={inputCls} />
            </Field>
          )}
          <Field label="Work email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={inputCls} />
          </Field>
          <Field label="Password">
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={register ? "8+ characters" : "••••••••"} className={inputCls} />
          </Field>
          {register && (
            <Field label="Organization name">
              <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Company name" className={inputCls} />
            </Field>
          )}

          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

          <button type="submit" disabled={busy} className="mt-1 flex w-full items-center justify-center rounded-[10px] bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
            {busy ? "…" : register ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => { setMode((m) => (m === "signin" ? "register" : "signin")); setError(null); }}
        >
          {register ? "Have an account? Sign in" : "Need an account? Register"}
        </button>

        <div className="mt-6 flex items-center justify-center gap-1.5 border-t border-border pt-4 text-[11px] text-muted-foreground">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" aria-hidden><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          Access is restricted and every action is audited.
        </div>
      </div>
    </main>
  );
}

const inputCls =
  "w-full rounded-[10px] border-[1.5px] border-border bg-muted px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}
