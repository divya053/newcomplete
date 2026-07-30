import { PageHeader } from "@ci/ui";
import { listHostEditions, listTenants } from "@/domain/host";
import { TenantsClient } from "../_components/tenants-client";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const [tenants, editions] = await Promise.all([listTenants(), listHostEditions()]);
  return (
    <div className="space-y-6">
      <PageHeader title="Tenants" description="Every customer org — edition, status, usage and health. Open one to impersonate or manage." />
      <TenantsClient
        tenants={tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug, status: t.status, region: t.region, edition: t.edition, seats: t.seats, planMinor: t.planMinor, usageMinor: t.usageMinor, contact: t.contact }))}
        editions={editions.filter((e) => e.status === "published").map((e) => ({ id: e.id, name: e.name }))}
      />
    </div>
  );
}
