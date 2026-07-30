import { PageHeader } from "@ci/ui";
import { listBroadcasts, listHostInbox } from "@/domain/host";
import { resolveHostContext } from "@/server/host-context";
import { NotificationsClient } from "../_components/notifications-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const ctx = await resolveHostContext();
  const [inbox, sent] = await Promise.all([listHostInbox(ctx.userId), listBroadcasts()]);
  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Your inbox, and announcements sent to tenants." />
      <NotificationsClient
        inbox={inbox.map((n) => ({ id: n.id, kind: n.kind, severity: n.severity, title: n.title, body: n.body, createdAt: n.createdAt.toISOString(), read: n.read }))}
        sent={sent.map((s) => ({ id: s.id, title: s.title, audienceType: s.audienceType, deliverEmail: s.deliverEmail, deliverInApp: s.deliverInApp, recipients: s.recipients, sentAt: s.sentAt ? s.sentAt.toISOString() : null }))}
      />
    </div>
  );
}
