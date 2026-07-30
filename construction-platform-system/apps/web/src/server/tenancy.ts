"use server";

import { cookies } from "next/headers";
import { createOrg } from "@/domain/tenancy";
import { ACTIVE_ORG_COOKIE, getUserOrgs, resolveContext } from "@/server/context";
import { ForbiddenError } from "@/server/errors";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 };

/** Create a new org and immediately switch the active tenant into it. */
export async function createOrgAction(input: { name: string }) {
  const ctx = await resolveContext();
  const { orgId } = await createOrg(ctx, input);
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, COOKIE_OPTS);
  return { orgId };
}

/** Switch the active tenant — only to an org the user actually belongs to. */
export async function switchOrgAction(orgId: string) {
  const ctx = await resolveContext();
  const orgs = await getUserOrgs(ctx.userId);
  if (!orgs.some((o) => o.orgId === orgId)) throw new ForbiddenError("not a member of that organization");
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, COOKIE_OPTS);
  return { orgId };
}
