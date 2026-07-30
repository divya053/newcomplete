import { ScopedRepository, schema, type Tx } from "@ci/db";
import { and, desc, eq, isNull } from "drizzle-orm";

/**
 * Tenant-scoped repositories for TenderLogix (guardrail #2). Constructed only with a
 * `tx` from withTenant, so every query is org-filtered. On MariaDB the `org_id`
 * predicate IS the tenant boundary (no RLS), so NEVER query these tables raw — go
 * through here.
 */
export class TenderProjectRepository extends ScopedRepository<typeof schema.tenderProjects> {
  constructor(tx: Tx, orgId: string) {
    super(tx, orgId, schema.tenderProjects);
  }

  /** All active projects for the tenant, newest first. */
  async list() {
    return this.tx
      .select()
      .from(schema.tenderProjects)
      .where(and(eq(schema.tenderProjects.orgId, this.orgId), isNull(schema.tenderProjects.archivedAt)))
      .orderBy(desc(schema.tenderProjects.createdAt));
  }

  async create(values: { id: string; name: string; client?: string | null; location?: string | null; quotationRef?: string | null }) {
    await this.tx.insert(schema.tenderProjects).values({
      id: values.id,
      orgId: this.orgId,
      name: values.name,
      client: values.client ?? null,
      location: values.location ?? null,
      quotationRef: values.quotationRef ?? null,
    });
  }
}

export class TenderBoqRepository extends ScopedRepository<typeof schema.tenderBoqItems> {
  constructor(tx: Tx, orgId: string) {
    super(tx, orgId, schema.tenderBoqItems);
  }

  /** BOQ lines for a project within the tenant. */
  async listForProject(projectId: string) {
    return this.tx
      .select()
      .from(schema.tenderBoqItems)
      .where(
        and(
          eq(schema.tenderBoqItems.orgId, this.orgId),
          eq(schema.tenderBoqItems.projectId, projectId),
          isNull(schema.tenderBoqItems.archivedAt),
        ),
      );
  }

  /** Move one line to a new lifecycle state (the domain decides; never the AI tier). */
  async setLifecycleState(id: string, state: string) {
    await this.tx
      .update(schema.tenderBoqItems)
      .set({ lifecycleState: state, updatedAt: new Date() })
      .where(and(eq(schema.tenderBoqItems.orgId, this.orgId), eq(schema.tenderBoqItems.id, id)));
  }
}
