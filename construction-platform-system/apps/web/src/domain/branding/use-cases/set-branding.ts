import { randomUUID } from "node:crypto";
import { audit, schema, withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";
import { SetBrandingInput } from "../model";

/**
 * Set the active tenant's brand-token overrides (white-label). One theme row per org:
 * update it if present, else insert. A branding change is consequential → audited.
 *   validate -> authorize -> tenant-scope -> work -> audit
 */
export async function setBranding(ctx: RequestContext, raw: unknown) {
  const input = SetBrandingInput.parse(raw); // 1. validate (keys allowlisted, values are HSL channels)
  requirePermission(ctx, PERMISSIONS.BRANDING_MANAGE); // 2. authorize

  return withTenant(ctx.orgId, async (tx) => {
    // 3. tenant-scope
    const existing = (
      await tx
        .select({ id: schema.tenantTheme.id, tokens: schema.tenantTheme.brandTokens })
        .from(schema.tenantTheme)
        .where(eq(schema.tenantTheme.orgId, ctx.orgId))
        .limit(1)
    )[0];

    // 4. work
    if (existing) {
      await tx
        .update(schema.tenantTheme)
        .set({ brandTokens: input.tokens, updatedAt: new Date() })
        .where(and(eq(schema.tenantTheme.orgId, ctx.orgId), eq(schema.tenantTheme.id, existing.id)));
    } else {
      await tx.insert(schema.tenantTheme).values({
        id: randomUUID(),
        orgId: ctx.orgId,
        brandTokens: input.tokens,
      });
    }

    // 5. audit
    await audit(tx, ctx, {
      action: "branding.updated",
      entityType: "tenant_theme",
      entityId: existing?.id,
      before: existing ? { tokens: existing.tokens ?? {} } : undefined,
      after: { tokens: input.tokens },
    });

    return { tokens: input.tokens };
  });
}
