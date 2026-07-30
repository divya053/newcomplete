// TEMPORARY dev-only route to exercise the real provision server action via curl
// (the register form calls the same function in the browser). Deleted after the demo.
import { NextResponse } from "next/server";
import { resolveContext } from "@/server/context";
import { provisionOrgForCurrentUser } from "@/server/provision";

export async function POST() {
  const prov = await provisionOrgForCurrentUser("Acme Test Org");
  if ("error" in prov) return NextResponse.json(prov, { status: 400 });
  // Now resolve the context to prove session -> membership -> role -> permissions.
  const ctx = await resolveContext();
  return NextResponse.json({
    provisioned: prov.orgId,
    userId: ctx.userId,
    orgId: ctx.orgId,
    permissionCount: ctx.permissions.size,
    permissions: [...ctx.permissions].sort(),
  });
}
