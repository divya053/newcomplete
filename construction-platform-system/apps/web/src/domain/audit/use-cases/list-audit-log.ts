import { schema, withTenant } from "@ci/db";
import { PERMISSIONS } from "@ci/shared";
import { desc, eq } from "drizzle-orm";
import { requirePermission } from "@/server/authz";
import type { RequestContext } from "@/server/context";

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: Date;
}

/**
 * Read the immutable audit trail for the active org (exit gate #4). Authorize
 * (audit:read) + tenant-scope; a read writes no audit row. Actor identity is
 * left-joined (system actors won't resolve to a user — that's fine, we show the id).
 * Audit rows can never be updated/deleted (DB triggers), so this is a faithful log.
 */
export async function listAuditLog(ctx: RequestContext, limit = 200): Promise<AuditEntry[]> {
  requirePermission(ctx, PERMISSIONS.AUDIT_READ);

  return withTenant(ctx.orgId, async (tx) => {
    return tx
      .select({
        id: schema.auditLog.id,
        action: schema.auditLog.action,
        entityType: schema.auditLog.entityType,
        entityId: schema.auditLog.entityId,
        actorUserId: schema.auditLog.actorUserId,
        actorName: schema.users.name,
        actorEmail: schema.users.email,
        createdAt: schema.auditLog.createdAt,
      })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorUserId))
      .where(eq(schema.auditLog.orgId, ctx.orgId))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(limit);
  });
}
