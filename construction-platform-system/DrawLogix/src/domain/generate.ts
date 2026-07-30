import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { extractDesignFromDocuments } from "@/ai/agent";
import { db, schema } from "@/db/client";
import { withTenant } from "@/db/tenant";
import { buildDxf, buildSvg, deriveSchedule, extractRequirements } from "./concept";
import { solveFloorPlan } from "./floorplan";

/**
 * Generate (or regenerate) the concept for a project from its documents. Replaces the
 * project's prior requirements + drawings so re-running is idempotent. Produces one
 * concept_plan drawing (SVG + DXF + area schedule) in the `ai_generated` state.
 */
export async function generateConcept(orgId: string, projectId: string) {
  const docs = await db
    .select({ id: schema.drawingDocuments.id, content: schema.drawingDocuments.content })
    .from(schema.drawingDocuments)
    .where(
      and(
        eq(schema.drawingDocuments.orgId, orgId),
        eq(schema.drawingDocuments.projectId, projectId),
        isNull(schema.drawingDocuments.archivedAt),
      ),
    );

  if (docs.length === 0) throw new Error("Add at least one document before generating a concept");

  const requirements = extractRequirements(docs);
  const baseRooms = deriveSchedule(requirements);
  const schedule = solveFloorPlan(baseRooms.map((s) => ({ name: s.room, areaSqm: s.areaSqm, requirementRef: s.requirementRef })));
  const svg = buildSvg(schedule);
  const dxf = buildDxf(schedule);
  const traceability = [...new Set(schedule.map((s) => s.requirementRef).filter((r): r is string => Boolean(r)))];
  const drawingId = randomUUID();

  await withTenant(orgId, async (tx) => {
    // Replace prior generated artifacts for this project (idempotent regenerate).
    await tx.delete(schema.drawingRequirements).where(and(eq(schema.drawingRequirements.orgId, orgId), eq(schema.drawingRequirements.projectId, projectId)));
    await tx.delete(schema.drawings).where(and(eq(schema.drawings.orgId, orgId), eq(schema.drawings.projectId, projectId)));

    for (const r of requirements) {
      await tx.insert(schema.drawingRequirements).values({
        id: randomUUID(),
        orgId,
        projectId,
        ref: r.ref,
        seq: r.seq,
        category: r.category,
        title: r.title,
        detail: r.detail ?? null,
        sourceDocumentId: r.sourceDocumentId ?? null,
      });
    }

    await tx.insert(schema.drawings).values({
      id: drawingId,
      orgId,
      projectId,
      title: "Concept Floor Plan",
      kind: "concept_plan",
      lifecycleState: "ai_generated",
      svg,
      dxf,
      schedule,
      traceability,
      aiConfidence: "0.820",
      generationMethod: "rule_based_concept",
    });

    await tx
      .update(schema.drawingProjects)
      .set({ status: "ready", updatedAt: new Date() })
      .where(and(eq(schema.drawingProjects.orgId, orgId), eq(schema.drawingProjects.id, projectId)));
  });

  return { drawingId, requirements: requirements.length, rooms: schedule.length };
}

/**
 * AI generation: Claude READS the project's documents, extracts categorised
 * requirements + a room programme grounded in them, and we render + persist the
 * concept (with each space traced to the requirement it satisfies). Same DXF/SVG/IFC
 * pipeline as the rule-based path — just a far better understanding of the brief.
 */
export async function generateConceptAI(orgId: string, projectId: string) {
  const docs = await db
    .select({
      name: schema.drawingDocuments.name,
      docType: schema.drawingDocuments.docType,
      content: schema.drawingDocuments.content,
    })
    .from(schema.drawingDocuments)
    .where(
      and(
        eq(schema.drawingDocuments.orgId, orgId),
        eq(schema.drawingDocuments.projectId, projectId),
        isNull(schema.drawingDocuments.archivedAt),
      ),
    );

  if (docs.length === 0) throw new Error("Add at least one document before generating a concept");

  let design: Awaited<ReturnType<typeof extractDesignFromDocuments>>;
  try {
    design = await extractDesignFromDocuments(docs.map((d) => ({ name: d.name, docType: d.docType, content: d.content ?? "" })));
  } catch {
    // AI tier failed (e.g. unreadable docs) — fall back to rule-based so the user still gets a plan.
    return generateConcept(orgId, projectId);
  }
  // If the AI couldn't find a programme in the documents, fall back rather than error out.
  if (design.rooms.length === 0) return generateConcept(orgId, projectId);

  // Solve a real floor plan (corridor spine, true areas, doors, windows). Honour the
  // stated footprint, expand repeated rooms, and nest en-suites.
  const envelope = design.footprint
    ? { widthAcross: Math.min(design.footprint.widthM, design.footprint.lengthM), lengthAlong: Math.max(design.footprint.widthM, design.footprint.lengthM) }
    : undefined;
  const schedule = solveFloorPlan(
    design.rooms.map((r) => ({
      name: r.name,
      areaSqm: r.areaSqm,
      kind: r.kind,
      connectsTo: r.connectsTo,
      requirementRef: r.requirementRef,
      count: r.count,
      ensuiteSqm: r.ensuiteSqm,
    })),
    envelope,
  );
  if (schedule.length === 0) throw new Error("Couldn't lay out a plan from these documents — add more detail to the brief.");
  const svg = buildSvg(schedule);
  const dxf = buildDxf(schedule);
  const traceability = [...new Set(schedule.map((s) => s.requirementRef).filter((r): r is string => Boolean(r)))];
  const drawingId = randomUUID();

  await withTenant(orgId, async (tx) => {
    await tx.delete(schema.drawingRequirements).where(and(eq(schema.drawingRequirements.orgId, orgId), eq(schema.drawingRequirements.projectId, projectId)));
    await tx.delete(schema.drawings).where(and(eq(schema.drawings.orgId, orgId), eq(schema.drawings.projectId, projectId)));

    let seq = 0;
    for (const r of design.requirements) {
      seq += 1;
      await tx.insert(schema.drawingRequirements).values({
        id: randomUUID(),
        orgId,
        projectId,
        ref: r.ref,
        seq,
        category: r.category,
        title: r.title,
        detail: r.detail ?? null,
        sourceDocumentId: null,
      });
    }

    await tx.insert(schema.drawings).values({
      id: drawingId,
      orgId,
      projectId,
      title: "Concept Floor Plan",
      kind: "concept_plan",
      lifecycleState: "ai_generated",
      svg,
      dxf,
      schedule,
      traceability,
      aiConfidence: "0.880",
      generationMethod: "ai_document_understanding",
    });

    await tx
      .update(schema.drawingProjects)
      .set({ status: "ready", updatedAt: new Date() })
      .where(and(eq(schema.drawingProjects.orgId, orgId), eq(schema.drawingProjects.id, projectId)));
  });

  return { drawingId, requirements: design.requirements.length, rooms: schedule.length };
}
