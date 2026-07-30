"use server";

import { createTenderProject, generateBoq } from "@/domain/tenderlogix";
import { resolveContext } from "@/server/context";
import { requireFeature } from "@/server/entitlement";

/**
 * Server actions = the APPLICATION/BFF edge for TenderLogix. They resolve the
 * RequestContext (identity + tenant + permissions), enforce the tenant's PLAN
 * (requireFeature — the SaaS axis), then delegate to the domain use-cases, which run
 * the validate→authorize→tenant-scope→work→audit spine (the RBAC axis).
 */
export async function createTenderProjectAction(input: { name: string; client?: string; location?: string }) {
  const ctx = await resolveContext();
  await requireFeature(ctx, "boq");
  return createTenderProject(ctx, input);
}

export async function generateBoqAction(input: { projectId: string }) {
  const ctx = await resolveContext();
  await requireFeature(ctx, "boq_ai"); // the AI pipeline is gated on the AI feature
  return generateBoq(ctx, input);
}
