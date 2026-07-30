import { char, decimal, int, longtext, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { baseColumns } from "./_base";
import { json } from "./_types";

/**
 * DrawLogix — AI drawing-lifecycle module (the architect-side counterpart to
 * TenderLogix). It owns the UPSTREAM workflow the comparison doc calls the
 * differentiator: SOW / client interview → structured requirement document →
 * concept drawing (area schedule + SVG floor-plan), with every concept element
 * traceable back to the requirement that produced it. Human-in-the-loop: the AI
 * proposes, the engineer approves through the artifact lifecycle.
 *
 * Real Revit/DWG output is a later phase (needs Autodesk Platform Services); this
 * MVP generates a viewable CONCEPT, not a stamped engineering deliverable.
 * Platform conventions: org_id on every table, char(36) PKs, portable JSON.
 */

// ── Projects ────────────────────────────────────────────────────────────────
export const drawingProjects = mysqlTable("drawing_projects", {
  ...baseColumns,
  name: varchar("name", { length: 255 }).notNull(),
  client: varchar("client", { length: 255 }),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("draft"), // draft | generating | ready
});

// ── Input documents (SOW, interview notes, specs, …) ────────────────────────
export const drawingDocuments = mysqlTable("drawing_documents", {
  ...baseColumns,
  projectId: char("project_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  docType: varchar("doc_type", { length: 32 }).notNull().default("sow"), // sow | interview | spec | rfp | other
  // Foundation: pasted/extracted text. (Object-store fileKey added when uploads land.)
  content: longtext("content"),
  fileKey: varchar("file_key", { length: 1024 }),
  status: varchar("status", { length: 32 }).notNull().default("received"), // received | processed | failed
});

// ── Structured requirements extracted from the documents (the traceability spine) ─
export const drawingRequirements = mysqlTable("drawing_requirements", {
  ...baseColumns,
  projectId: char("project_id", { length: 36 }).notNull(),
  ref: varchar("ref", { length: 32 }).notNull(), // "R-001"
  seq: int("seq").notNull().default(0),
  category: varchar("category", { length: 32 }).notNull().default("space"), // space | constraint | assumption | exclusion | clarification
  title: varchar("title", { length: 500 }).notNull(),
  detail: text("detail"),
  // Traceability back to the source document this requirement came from.
  sourceDocumentId: char("source_document_id", { length: 36 }),
});

// ── Generated drawing artifacts (ride the platform lifecycle) ────────────────
export const drawings = mysqlTable("drawings", {
  ...baseColumns,
  projectId: char("project_id", { length: 36 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  kind: varchar("kind", { length: 32 }).notNull().default("concept_plan"), // concept_plan | area_schedule
  // Lifecycle: ai_generated → draft → under_review → approved → published → archived.
  lifecycleState: varchar("lifecycle_state", { length: 32 }).notNull().default("ai_generated"),
  // The concept floor-plan as inline SVG (viewable in-app; no Autodesk needed).
  svg: longtext("svg"),
  // The same concept as a downloadable DXF (opens in AutoCAD/Revit) — generated
  // from the extracted document text. Open text format; no Autodesk dependency.
  dxf: longtext("dxf"),
  // The area schedule + layout spec: [{ ref, room, areaSqm, requirementRef }].
  schedule: json<unknown>("schedule"),
  // Which requirement refs this drawing was generated from (traceability).
  traceability: json<string[]>("traceability"),
  aiConfidence: decimal("ai_confidence", { precision: 4, scale: 3 }),
  generationMethod: varchar("generation_method", { length: 50 }).default("ai_concept"),
});

// ── AI copilot chat (ArchiLabs-style: chat to edit the concept) ──────────────
export const drawingMessages = mysqlTable("drawing_messages", {
  ...baseColumns,
  projectId: char("project_id", { length: 36 }).notNull(),
  role: varchar("role", { length: 16 }).notNull(), // user | assistant
  content: text("content").notNull(),
});
