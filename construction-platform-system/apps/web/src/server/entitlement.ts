import { getOrgFeatures } from "@/domain/saas";
import type { RequestContext } from "./context";
import { ForbiddenError } from "./errors";

/**
 * Subscription/entitlement gate (the SaaS axis) — SEPARATE from RBAC (guardrail #3).
 * RBAC asks "is this user allowed to do this?"; entitlement asks "does this tenant's
 * PLAN include this module?". Both must pass. The nav already hides modules a tenant
 * isn't entitled to, but that's cosmetic — this enforces it SERVER-SIDE so a direct
 * action call can't bypass the plan. The host org has every feature.
 */
export async function requireFeature(ctx: RequestContext, feature: string): Promise<void> {
  if (ctx.isHost) return;
  const features = await getOrgFeatures(ctx);
  if (!features.has(feature)) throw new ForbiddenError(`feature '${feature}' is not in your plan`);
}
