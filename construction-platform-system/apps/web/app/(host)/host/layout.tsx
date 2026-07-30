import { db, schema } from "@ci/db";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getUnreadCount } from "@/domain/host";
import { getUserIdentity } from "@/server/context";
import { resolveHostContext } from "@/server/host-context";
import { HostShell } from "./_components/host-shell";

/**
 * The hardened Host Console shell (spec §0.2, §8 of the app blueprint). Auth-gated to
 * HOST staff only: resolveHostContext requires a membership in the host org; anyone
 * else is bounced to /login. The whole area is dark-first (mock default).
 */
export default async function HostLayout({ children }: { children: ReactNode }) {
  let ctx: Awaited<ReturnType<typeof resolveHostContext>>;
  try {
    ctx = await resolveHostContext();
  } catch {
    redirect("/login");
  }

  const [me, roleRow, tenantCountRow, unread] = await Promise.all([
    getUserIdentity(ctx.userId),
    db
      .select({ role: schema.roles.name })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .where(and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, ctx.userId)))
      .limit(1),
    db.select({ n: sql<number>`count(*)` }).from(schema.orgs).where(and(eq(schema.orgs.isHost, false), eq(schema.orgs.status, "trial"))),
    getUnreadCount(ctx.userId),
  ]);

  const roleLabel: Record<string, string> = { owner: "Platform Admin", admin: "Admin", billing: "Billing / Finance", support: "Support", sales: "Sales" };
  const role = roleRow[0]?.role ?? "staff";

  return (
    <HostShell
      user={{ name: me?.name ?? "Host user", email: me?.email ?? "", role: roleLabel[role] ?? role }}
      tenantCount={Number(tenantCountRow[0]?.n ?? 0)}
      unread={unread}
    >
      {children}
    </HostShell>
  );
}
