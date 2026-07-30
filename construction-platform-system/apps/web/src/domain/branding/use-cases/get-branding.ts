import { db, schema } from "@ci/db";
import { desc, eq } from "drizzle-orm";
import type { RequestContext } from "@/server/context";
import type { Branding } from "../model";

/**
 * The active tenant's brand-token overrides (read on every request by the shell to
 * recolor the app). A raw read is fine here — it carries the org_id filter, so the
 * isolation guard is satisfied — and it avoids opening a transaction on the hot path.
 * Returns null when the tenant hasn't customized anything.
 */
export async function getBranding(ctx: RequestContext): Promise<Branding | null> {
  const row = (
    await db
      .select({ tokens: schema.tenantTheme.brandTokens })
      .from(schema.tenantTheme)
      .where(eq(schema.tenantTheme.orgId, ctx.orgId))
      .orderBy(desc(schema.tenantTheme.createdAt))
      .limit(1)
  )[0];
  if (!row?.tokens || Object.keys(row.tokens).length === 0) return null;
  return { tokens: row.tokens };
}
