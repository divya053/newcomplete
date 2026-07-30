"use server";

import { changeEdition, createEdition, setTenantEdition } from "@/domain/saas";
import { resolveContext } from "@/server/context";

/** Host — create an edition from selected feature ids. */
export async function createEditionAction(input: { name: string; description?: string; featureIds: string[] }) {
  const ctx = await resolveContext();
  return createEdition(ctx, input);
}

/** Host — assign a tenant's edition. */
export async function setTenantEditionAction(input: { orgId: string; editionId: string }) {
  const ctx = await resolveContext();
  return setTenantEdition(ctx, input.orgId, input.editionId);
}

/** Tenant — upgrade/downgrade the active org's plan. */
export async function changeEditionAction(editionId: string) {
  const ctx = await resolveContext();
  return changeEdition(ctx, editionId);
}
