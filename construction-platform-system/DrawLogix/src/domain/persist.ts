import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { schema, type ScheduleRow } from "@/db/client";
import { withTenant } from "@/db/tenant";
import { buildDxf, buildSvg } from "./concept";
import { solveFloorPlan } from "./floorplan";

/**
 * Re-render a schedule (SVG + DXF) and upsert it as the project's concept drawing.
 * Updates the latest concept if one exists, else creates one and marks the project
 * ready. Shared by the AI copilot and design-from-brief flows.
 */
export async function saveConcept(orgId: string, projectId: string, scheduleInput: ScheduleRow[]): Promise<string> {
  // Re-solve the floor plan from the (possibly edited) room programme.
  const schedule = solveFloorPlan(
    scheduleInput.map((s) => ({ name: s.room, areaSqm: s.areaSqm, kind: s.kind, requirementRef: s.requirementRef })),
  );
  const svg = buildSvg(schedule);
  const dxf = buildDxf(schedule);

  return withTenant(orgId, async (tx) => {
    const existing = (
      await tx
        .select({ id: schema.drawings.id })
        .from(schema.drawings)
        .where(and(eq(schema.drawings.orgId, orgId), eq(schema.drawings.projectId, projectId), isNull(schema.drawings.archivedAt)))
        .orderBy(desc(schema.drawings.createdAt))
        .limit(1)
    )[0];

    if (existing) {
      await tx
        .update(schema.drawings)
        .set({ schedule, svg, dxf, updatedAt: new Date() })
        .where(and(eq(schema.drawings.orgId, orgId), eq(schema.drawings.id, existing.id)));
      return existing.id;
    }

    const id = randomUUID();
    await tx.insert(schema.drawings).values({
      id,
      orgId,
      projectId,
      title: "Concept Floor Plan",
      kind: "concept_plan",
      lifecycleState: "ai_generated",
      svg,
      dxf,
      schedule,
      traceability: [],
      aiConfidence: "0.850",
      generationMethod: "ai_agent",
    });
    await tx
      .update(schema.drawingProjects)
      .set({ status: "ready", updatedAt: new Date() })
      .where(and(eq(schema.drawingProjects.orgId, orgId), eq(schema.drawingProjects.id, projectId)));
    return id;
  });
}
