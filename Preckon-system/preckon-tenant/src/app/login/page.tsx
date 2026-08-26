"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/* A non-secret identity label only. NEXT_PUBLIC_ values reach the browser, so
   nothing secret may ever be read here — that is the point: the email is a
   convenience, and there is deliberately no password counterpart.

   Set NEXT_PUBLIC_DEMO_IDENTITY per environment to change it without a rebuild
   of this file; the fallback is the demo workspace this deployment presents. */
const DEMO_IDENTITY = process.env.NEXT_PUBLIC_DEMO_IDENTITY ?? "owner@cedarstone.build";

export default function LoginPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  /* The password starts EMPTY and is never prefilled.
     It used to default to a working credential, and the panel below printed it
     in full, so anyone who loaded /login was handed a live sign-in. A demo
     identity is a convenience; a demo secret is a disclosure. The email is a
     non-secret label and may still be suggested. */
  const [email, setEmail] = useState(DEMO_IDENTITY);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (session?.user) router.replace("/overview"); }, [session, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) setErr(error.message ?? "Sign-in failed");
    else router.replace("/overview");
  }

  return (
    <div className="login-wrap">
      <div className="login">
        <div className="brand">
          <span className="wm">Preckon<span className="o">.</span></span>
          <span className="host-pill">TENANT</span>
        </div>
        <h1>Sign in to your workspace</h1>
        <p className="sub">The AI-native construction operating system.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {err && <div className="auth-err"><span>{err}</span></div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        {/* No credential panel. This printed "Demo tenant owner · <email> /
            <password>" — a working sign-in handed to anyone who loaded the page.
            The email survives as a prefill in the field above, which is a
            convenience; naming the account here as well only advertises which
            one to attack, and the password never belonged on screen at all. */}
        <div className="restricted">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          Restricted workspace
        </div>
      </div>
    </div>
  );
}
