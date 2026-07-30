"use server";

import { setBranding } from "@/domain/branding";
import { resolveContext } from "@/server/context";

/** Application/BFF edge for white-label branding — validate + authorize in the domain. */
export async function setBrandingAction(input: { tokens: Record<string, string> }) {
  const ctx = await resolveContext();
  return setBranding(ctx, input);
}
