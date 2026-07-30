import { char, decimal, int, longtext, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { baseColumns } from "./_base";
import { json } from "./_types";

/**
 * TenderLogix — the first product module (Phase 1), ported from the standalone
 * AutoCAD-BOQ-Tender app into the platform as a proper bounded context.
 *
 * What changed in the port (the 10 laws):
 *  - **Tenancy (Law #2):** the source app had NONE. Every table here now carries
 *    `org_id` (via baseColumns) — including the vector table `tender_cad_chunks` —
 *    and is reached only through the tenant-scoped repository.
 *  - **PKs:** `int autoincrement` → `char(36)` UUIDv7 (platform convention); every
 *    foreign key is `char(36)` accordingly.
 *  - **Soft-archive:** the source `projects.archived` int → `archivedAt` (baseColumns).
 *  - **Lifecycle (Canon §5):** a BOQ item is the AI-generated artifact that rides the
 *    platform lifecycle (ai_generated → … → published); `lifecycleState` is the
 *    canonical gate. The source `approvalStatus` is kept for export compatibility.
 *  - **JSON:** uses the portable `json` type (parses on read — MariaDB returns JSON
 *    columns as strings; see schema/_types.ts).
 *
 * All tables are prefixed `tender_` to namespace the module within the monolith.
 */

// ── Projects ────────────────────────────────────────────────────────────────
export const tenderProjects = mysqlTable("tender_projects", {
  ...baseColumns,
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).notNull().default("draft"), // draft | processing | completed
  // BOQ / tender export meta — stamped onto the exported Bill of Quantities.
  location: varchar("location", { length: 255 }),
  client: varchar("client", { length: 255 }),
  quotationRef: varchar("quotation_ref", { length: 255 }),
  submissionDate: varchar("submission_date", { length: 100 }), // free-text, e.g. "23rd August 2025"
  commencementDate: varchar("commencement_date", { length: 20 }), // ISO "YYYY-MM-DD"; Gantt day 0
});

// ── Documents (uploaded CAD drawings + tender docs) ─────────────────────────
export const tenderDocuments = mysqlTable("tender_documents", {
  ...baseColumns,
  projectId: char("project_id", { length: 36 }).notNull(),
  filename: varchar("filename", { length: 500 }).notNull(),
  originalName: varchar("original_name", { length: 500 }).notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull(), // drawing | tender | sow | rfp | spec | addendum | other
  fileSize: int("file_size").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  filePath: varchar("file_path", { length: 1024 }).notNull(), // object-store key (S3/MinIO), not local disk
  status: varchar("status", { length: 50 }).notNull().default("uploaded"), // uploaded | processing | processed | failed
  extractedText: longtext("extracted_text"),
  cadExtractionStatus: varchar("cad_extraction_status", { length: 32 }).default("pending"), // pending|running|succeeded|failed|skipped
});

// ── SOW outline (scope-area breakdown extracted from tender docs) ────────────
export const tenderSowSections = mysqlTable("tender_sow_sections", {
  ...baseColumns,
  projectId: char("project_id", { length: 36 }).notNull(),
  seq: int("seq").notNull().default(0),
  sowRef: varchar("sow_ref", { length: 64 }).notNull(), // the document's own ref ("2.1", "Lot 3")
  ourRef: varchar("our_ref", { length: 64 }),
  parentSowRef: varchar("parent_sow_ref", { length: 64 }), // null for a top-level node
  title: varchar("title", { length: 500 }).notNull(),
  measurementBasis: varchar("measurement_basis", { length: 200 }),
  scopeNotes: text("scope_notes"),
});

// ── CAD extraction (one row per parsed document; summary = extractor JSON) ────
export const tenderCadExtractions = mysqlTable("tender_cad_extractions", {
  ...baseColumns,
  documentId: char("document_id", { length: 36 }).notNull(),
  projectId: char("project_id", { length: 36 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending|running|succeeded|failed
  summary: json<unknown>("summary"), // full JSON returned by the Python extractor
  errorMessage: text("error_message"),
  layerCount: int("layer_count"),
  blockDefinitionCount: int("block_definition_count"),
  blockInstanceTotal: int("block_instance_total"),
  textAnnotationCount: int("text_annotation_count"),
  scheduleCount: int("schedule_count"),
  chunkCount: int("chunk_count"),
});

// ── CAD chunks (the vector/retrieval table — org-scoped like every owned table) ─
export const tenderCadChunks = mysqlTable("tender_cad_chunks", {
  ...baseColumns,
  extractionId: char("extraction_id", { length: 36 }).notNull(),
  documentId: char("document_id", { length: 36 }).notNull(),
  projectId: char("project_id", { length: 36 }).notNull(),
  chunkType: varchar("chunk_type", { length: 32 }).notNull(), // text|block_count|layer|schedule|title_block|dimension|vision_finding
  sourceDocumentType: varchar("source_document_type", { length: 32 }),
  section: varchar("section", { length: 500 }),
  page: int("page"),
  layer: varchar("layer", { length: 255 }),
  blockName: varchar("block_name", { length: 255 }),
  sheet: varchar("sheet", { length: 255 }),
  refId: varchar("ref_id", { length: 255 }), // stable id, e.g. "doc:42/block:LIGHT_2x2_LED"
  text: longtext("text").notNull(),
  embedding: json<number[]>("embedding"), // float[]; cosine search app-side (MariaDB has no pgvector)
  embeddingModel: varchar("embedding_model", { length: 64 }),
});

// ── BOQ items (THE artifact that rides the platform lifecycle) ───────────────
export const tenderBoqItems = mysqlTable("tender_boq_items", {
  ...baseColumns,
  projectId: char("project_id", { length: 36 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  itemCode: varchar("item_code", { length: 100 }),
  description: text("description").notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }),
  totalPrice: decimal("total_price", { precision: 14, scale: 2 }),
  notes: text("notes"),
  // Confidence travels WITH the artifact (Canon §5).
  aiConfidence: decimal("ai_confidence", { precision: 4, scale: 3 }),
  // The platform artifact lifecycle is the canonical gate (every transition audited).
  lifecycleState: varchar("lifecycle_state", { length: 32 }).notNull().default("ai_generated"),
  verificationStatus: varchar("verification_status", { length: 50 }).default("unverified"),
  verificationNotes: text("verification_notes"),
  // Kept for AIGCC export compatibility (the source QS sign-off flag).
  approvalStatus: varchar("approval_status", { length: 20 }).default("pending"),
  generationMethod: varchar("generation_method", { length: 50 }).default("single"), // single | multi
  // AIGCC 4-level priced-BOQ hierarchy.
  sowRef: varchar("sow_ref", { length: 32 }),
  ourRef: varchar("our_ref", { length: 32 }),
  subRef: varchar("sub_ref", { length: 32 }),
  srNo: varchar("sr_no", { length: 32 }),
  remarks: text("remarks"),
  // Provenance back into the CAD drawings: [{ refId, layer, blockName, sheet, documentId, type }].
  drawingReferences: json<unknown>("drawing_references"),
});
