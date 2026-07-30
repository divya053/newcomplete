import { v7 as uuidv7 } from "uuid";
import { auditLog } from "./schema/audit";
import type { Tx } from "./scoped";

/** Minimal request context the audit hook needs (mirrors the app's RequestContext). */
export interface AuditContext {
  orgId: string;
  userId?: string;
  correlationId?: string;
}

export interface AuditEvent {
  action: string; // "boq.published", "threshold.changed", ...
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Write an immutable audit record INSIDE the same transaction as the change it
 * records (ws 0.5, guardrail #4) — so the state change and its audit row commit or
 * roll back together. Audit rows are never updated or deleted (enforced at the DB).
 *
 *   await withTenant(ctx.orgId, async (tx) => {
 *     const before = await loadBoq(tx, id);
 *     const after  = await transitionBoq(tx, id, "published");
 *     await audit(tx, ctx, { action: "boq.published", entityType: "boq", entityId: id, before, after });
 *   });
 */
export async function audit(tx: Tx, ctx: AuditContext, e: AuditEvent): Promise<void> {
  await tx.insert(auditLog).values({
    id: uuidv7(),
    orgId: ctx.orgId,
    actorUserId: ctx.userId ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    before: (e.before as object) ?? null,
    after: (e.after as object) ?? null,
    correlationId: ctx.correlationId ?? null,
  });
}
