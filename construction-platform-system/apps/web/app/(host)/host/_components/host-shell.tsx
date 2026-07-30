"use client";

import { Avatar, Button, cn } from "@ci/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/auth-client";

interface NavItem { href: string; label: string; badge?: number }
interface NavGroup { title: string; items: NavItem[] }

const NAV: NavGroup[] = [
  { title: "Platform", items: [{ href: "/host", label: "Overview" }, { href: "/host/tenants", label: "Tenants" }, { href: "/host/subscriptions", label: "Subscriptions" }] },
  { title: "Product", items: [{ href: "/host/editions", label: "Editions" }, { href: "/host/features", label: "Features" }, { href: "/host/pricing", label: "Pricing" }] },
  { title: "Operations", items: [{ href: "/host/observability", label: "Observability" }, { href: "/host/audit", label: "Audit log" }, { href: "/host/notifications", label: "Notifications" }] },
  { title: "Administration", items: [{ href: "/host/users", label: "Host users & roles" }, { href: "/host/settings", label: "Host settings" }] },
];

const TITLES: Record<string, string> = {
  "/host": "Overview", "/host/tenants": "Tenants", "/host/subscriptions": "Subscriptions & billing",
  "/host/editions": "Editions", "/host/features": "Features", "/host/pricing": "Pricing",
  "/host/observability": "Observability", "/host/audit": "Audit log", "/host/notifications": "Notifications",
  "/host/users": "Host users & roles", "/host/settings": "Host settings",
};

export function HostShell({
  children, user, tenantCount, unread,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: string };
  tenantCount: number;
  unread: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(true);

  // Dark-first (mock default). Kept local to the host wrapper so it never fights the
  // tenant app's own theme; persisted under a host-scoped key.
  useEffect(() => {
    try {
      const t = localStorage.getItem("preckon-host-theme");
      if (t) setDark(t === "dark");
    } catch {}
  }, []);
  function toggleTheme() {
    setDark((d) => {
      const next = !d;
      try { localStorage.setItem("preckon-host-theme", next ? "dark" : "light"); } catch {}
      return next;
    });
  }

  const crumb = TITLES[pathname] ?? "Host";
  const badges: Record<string, number> = { "/host/tenants": tenantCount, "/host/notifications": unread };

  return (
    <div className={cn(dark && "dark")}>
      <div className="grid min-h-screen grid-cols-[250px_1fr] bg-background text-foreground">
        {/* Sidebar */}
        <aside className="flex flex-col border-r border-border bg-card">
          <div className="flex items-center gap-2.5 px-5 py-4">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground shadow-sm">P</span>
            <div className="flex items-center gap-2">
              <span className="font-display text-[17px] font-semibold tracking-tight">Preck<span className="text-primary">o</span>n</span>
              <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-primary">Host</span>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
            {NAV.map((g) => (
              <div key={g.title} className="mb-1">
                <p className="px-2.5 pb-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{g.title}</p>
                {g.items.map((it) => {
                  const active = it.href === "/host" ? pathname === "/host" : pathname.startsWith(it.href);
                  const b = badges[it.href];
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={cn(
                        "relative flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-all",
                        active
                          ? "bg-primary/10 font-medium text-primary before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-full before:bg-primary"
                          : "text-foreground/80 hover:translate-x-0.5 hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span>{it.label}</span>
                      {b ? <span className="rounded-full bg-warning/15 px-1.5 font-mono text-[10px] text-warning">{b}</span> : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
            <Avatar name={user.name} email={user.email} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium leading-tight">{user.name}</div>
              <div className="truncate font-mono text-[11px] leading-tight text-muted-foreground">{user.role}</div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Host</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="font-medium">{crumb}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/host/notifications" className="relative grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Notifications">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                {unread > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[9px] font-bold text-primary-foreground">{unread}</span>}
              </Link>
              <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme" title={dark ? "Light mode" : "Dark mode"}>
                {dark ? <SunIcon /> : <MoonIcon />}
              </Button>
              <Button size="sm" variant="outline" onClick={async () => { await signOut(); router.push("/login"); router.refresh(); }}>Sign out</Button>
            </div>
          </header>
          <main className="flex-1 bg-background p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

function MoonIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
}
function SunIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>;
}
