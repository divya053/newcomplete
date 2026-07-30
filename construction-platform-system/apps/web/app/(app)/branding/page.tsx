import { PERMISSIONS } from "@ci/shared";
import { Card, CardContent, EmptyState, PageHeader } from "@ci/ui";
import { getBranding } from "@/domain/branding";
import { resolveContext } from "@/server/context";
import { BrandingForm } from "./_components/branding-form";

/**
 * Branding (white-label, ws 0.9) — set this tenant's brand colors. They override the
 * design tokens for everyone in the org, app-wide, at request time (no rebuild). Gated
 * by branding:manage; tenant-scoped like everything else.
 */
export default async function BrandingPage() {
  const ctx = await resolveContext();

  if (!ctx.permissions.has(PERMISSIONS.BRANDING_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Branding" description="White-label your workspace." />
        <Card>
          <CardContent>
            <EmptyState title="No access" hint="Your role can't manage branding (needs the branding:manage permission)." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const branding = await getBranding(ctx);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branding"
        description="White-label this workspace — your colors apply across the whole app for everyone in your organization."
      />
      <BrandingForm initial={branding?.tokens ?? {}} />
    </div>
  );
}
