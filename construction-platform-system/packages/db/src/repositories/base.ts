import { and, eq, isNull } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import type { Tx } from "../scoped";

/**
 * The tenant-scoped repository pattern (ws 0.10.2, guardrail #2). There is NO
 * unscoped repository: a repo is ALWAYS constructed with a `tx` that came from
 * `withTenant`, and the base class injects the `org_id` filter + the soft-archive
 * filter on every query; concrete repos extend it per bounded context.
 *
 * ⚠️ MariaDB port: on Postgres, RLS was the backstop (the DB physically could not
 * return another tenant's rows) and this repo was the ergonomic layer on top. On
 * MariaDB there IS NO RLS — so the `eq(table.orgId, orgId)` predicate below is THE
 * tenant boundary, not a convenience. Every owned-table query must come through here
 * (or another ScopedRepository subclass). A raw query that forgets the org filter
 * leaks across tenants. See scoped.ts.
 */
export abstract class ScopedRepository<TTable extends MySqlTable & { orgId: any; id: any; archivedAt: any }> {
  protected constructor(
    protected readonly tx: Tx,
    protected readonly orgId: string,
    protected readonly table: TTable,
  ) {}

  /** Active (non-archived) row by id, within this tenant. */
  async find(id: string) {
    const rows = await this.tx
      .select()
      .from(this.table as MySqlTable)
      .where(and(eq(this.table.orgId, this.orgId), eq(this.table.id, id), isNull(this.table.archivedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Soft-archive (never a hard delete — keeps the audit/lifecycle trail intact). */
  async archive(id: string) {
    await this.tx
      .update(this.table)
      .set({ archivedAt: new Date() } as never)
      .where(and(eq(this.table.orgId, this.orgId), eq(this.table.id, id)));
  }
}
