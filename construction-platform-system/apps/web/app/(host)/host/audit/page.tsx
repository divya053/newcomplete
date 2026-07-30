import { Button, PageHeader } from "@ci/ui";
import { listHostAudit } from "@/domain/host";
import { resolveHostContext } from "@/server/host-context";
import { AuditClient } from "../_components/audit-client";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const ctx = await resolveHostContext();
  const rows = await listHostAudit(ctx.orgId, 80);
  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Every host action, append-only and tamper-evident." actions={<Button variant="outline" size="sm">Export</Button>} />
      <AuditClient rows={rows.map((r) => ({ id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, createdAt: r.createdAt.toISOString(), actor: r.actor }))} />
    </div>
  );
}
