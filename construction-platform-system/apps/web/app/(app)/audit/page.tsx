import {
  Avatar,
  Badge,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ci/ui";
import { listAuditLog } from "@/domain/audit";
import { resolveContext } from "@/server/context";

function fmt(d: Date) {
  // Deterministic UTC timestamp (server-rendered) — "2026-06-27 14:03:09"
  return new Date(d).toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Audit log (exit gate #4) — every consequential action in the active org, immutable
 * and append-only (enforced by DB triggers). Gated by `audit:read`.
 */
export default async function AuditPage() {
  const ctx = await resolveContext();

  let rows: Awaited<ReturnType<typeof listAuditLog>> = [];
  let forbidden = false;
  try {
    rows = await listAuditLog(ctx);
  } catch {
    forbidden = true;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every consequential action in this organization — append-only and immutable (DB-enforced)."
      />
      <Card>
        <CardContent className="pt-4">
          {forbidden ? (
            <EmptyState title="No access" hint="Your role can't read the audit log (needs the audit:read permission)." />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No audit entries yet"
              hint="Actions like creating a project, adding a member, or changing a role appear here as you use the app."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">When (UTC)</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{fmt(r.createdAt)}</TableCell>
                    <TableCell>
                      {r.actorName || r.actorEmail ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={r.actorName} email={r.actorEmail} className="h-6 w-6 text-[10px]" />
                          <span>{r.actorName ?? r.actorEmail}</span>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">{r.actorUserId ?? "system"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="text-foreground">{r.entityType}</span>
                      {r.entityId && <span className="ml-1.5 font-mono text-xs">{r.entityId.slice(0, 8)}…</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
