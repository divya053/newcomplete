import { PageHeader } from "@ci/ui";
import { listFeaturesFull } from "@/domain/host";
import { FeaturesClient } from "../_components/features-client";

export const dynamic = "force-dynamic";

export default async function FeaturesPage() {
  const features = await listFeaturesFull();
  return (
    <div className="space-y-6">
      <PageHeader title="Features" description="The catalog editions draw from. Each feature is a flag or a limit an edition can switch on." />
      <FeaturesClient features={features.map((f) => ({ id: f.id, key: f.key, name: f.name, category: f.category, type: f.type, status: f.status, editions: f.editions }))} />
    </div>
  );
}
