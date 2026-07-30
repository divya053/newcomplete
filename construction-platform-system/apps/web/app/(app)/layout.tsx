import { Avatar } from "@ci/ui";
import { PERMISSIONS } from "@ci/shared";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { brandingStyle, getBranding } from "@/domain/branding";
import { getOrgFeatures } from "@/domain/saas";
import { getUserIdentity, getUserOrgs, resolveContext } from "@/server/context";
import { NavLink } from "./_components/nav-link";
import { OrgSwitcher } from "./_components/org-switcher";
import { SignOutButton } from "./_components/sign-out";
import { ThemeToggle } from "./_components/theme-toggle";

/**
 * THE SHELL (ws 0.9, exit gate #7) — auth-gated (ws 0.3). Resolves the Better Auth
 * session server-side via resolveContext; no session (or no membership) => /login.
 * The top bar shows the real org + user; the side nav is the authenticated surface.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  let ctx: Awaited<ReturnType<typeof resolveContext>>;
  try {
    ctx = await resolveContext();
  } catch {
    redirect("/login");
  }
  const [orgs, me, features, branding] = await Promise.all([
    getUserOrgs(ctx.userId),
    getUserIdentity(ctx.userId),
    getOrgFeatures(ctx),
    getBranding(ctx),
  ]);
  const brandCss = brandingStyle(branding?.tokens);

  return (
    <div className="grid min-h-screen grid-cols-[230px_1fr] bg-muted/30">
      {/* Per-tenant white-label: override the brand tokens for THIS org only. The
          values are validated to HSL channels (no CSS injection possible). */}
      {brandCss && <style dangerouslySetInnerHTML={{ __html: brandCss }} />}
      <aside className="flex flex-col border-r border-border bg-background">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-primary to-accent text-sm font-bold text-white shadow-sm">CI</span>
          <span className="font-semibold leading-tight">Construction<br />Intelligence</span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Overview</p>
          <NavLink href="/">Dashboard</NavLink>
          <NavLink href="/projects">Projects</NavLink>

          <p className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Modules</p>
          {features.has("boq") && <NavLink href="/tenderlogix">TenderLogix</NavLink>}
          {!features.has("boq") && (
            <span className="px-2.5 py-1.5 text-xs text-muted-foreground/60">No modules in your plan</span>
          )}

          <p className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Administration</p>
          {ctx.isHost && (
            <a href="/host" className="mx-0.5 mb-1 flex items-center justify-between rounded-md bg-gradient-to-r from-primary/15 to-accent/10 px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:from-primary/25">
              Host Console
              <span className="font-mono text-[10px] text-primary/70">→</span>
            </a>
          )}
          {ctx.isHost && <NavLink href="/platform">Platform (legacy)</NavLink>}
          <NavLink href="/organizations">Organizations</NavLink>
          <NavLink href="/roles">Roles &amp; Members</NavLink>
          {ctx.permissions.has(PERMISSIONS.BRANDING_MANAGE) && <NavLink href="/branding">Branding</NavLink>}
          <NavLink href="/audit">Audit log</NavLink>
          <NavLink href="/plan">Plan &amp; features</NavLink>
        </nav>

        <div className="m-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <div className="font-medium text-foreground/70">Your access</div>
          <div>{ctx.permissions.size} permissions granted</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-background px-5 py-2.5">
          <OrgSwitcher orgs={orgs} activeOrgId={ctx.orgId} />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{me?.name ?? "User"}</div>
              <div className="text-xs leading-tight text-muted-foreground">{me?.email ?? ctx.userId.slice(0, 12)}</div>
            </div>
            <Avatar name={me?.name} email={me?.email} />
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
