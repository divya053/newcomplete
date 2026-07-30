"use server";

import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE, requireOrgId } from "@/db/tenant";
import { designFromBrief, sendCopilotMessage } from "@/domain/copilot";
import { addDocument, archiveDocument } from "@/domain/documents";
import { extractDocumentText } from "@/lib/extract";
import { isAiConfigured } from "@/ai/agent";
import { editDxf, type ModelSummary } from "@/ai/dxf-copilot";
import { type PageSelection, pdfToModel } from "@/domain/pdf-to-dxf";
import { generateConcept, generateConceptAI } from "@/domain/generate";
import { type LifecycleState, transitionDrawing } from "@/domain/lifecycle";
import { archiveProject, createProject } from "@/domain/projects";

export async function switchOrgAction(orgId: string) {
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function createProjectAction(input: { name: string; client?: string; description?: string }) {
  return createProject(await requireOrgId(), input);
}

export async function archiveProjectAction(projectId: string) {
  return archiveProject(await requireOrgId(), projectId);
}

export async function addDocumentAction(input: { projectId: string; name: string; docType: string; content: string }) {
  return addDocument(await requireOrgId(), input);
}

/**
 * Upload a document file (PDF/DOCX/TXT), extract its text, and record it on the
 * project. Pasted text (the `content` field) is merged in too, so either path works.
 */
export async function uploadDocumentAction(formData: FormData) {
  const orgId = await requireOrgId();
  const projectId = String(formData.get("projectId") ?? "");
  const docType = String(formData.get("docType") ?? "sow");
  let name = String(formData.get("name") ?? "").trim();
  let content = String(formData.get("content") ?? "").trim();

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    const extracted = (await extractDocumentText(file.name, buf)).trim();
    if (!name) name = file.name;
    if (extracted) content = content ? `${content}\n\n${extracted}` : extracted;
    else if (!content) {
      throw new Error("Couldn't extract text from that file — try a .txt/.md/.docx/.pdf, or paste the text instead.");
    }
  }

  return addDocument(orgId, { projectId, name, docType, content });
}

/**
 * Bulk upload: accept MANY files at once, extract each, and add them as documents.
 * Generation reads every document on the project, so all uploads feed the AI.
 */
export async function uploadDocumentsAction(formData: FormData) {
  const orgId = await requireOrgId();
  const projectId = String(formData.get("projectId") ?? "");
  const docType = String(formData.get("docType") ?? "sow");
  const pasted = String(formData.get("content") ?? "").trim();

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  let added = 0;
  const skipped: string[] = [];

  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const content = (await extractDocumentText(file.name, buf)).trim();
      if (!content) {
        const lower = file.name.toLowerCase();
        const reason = lower.endsWith(".pdf")
          ? "no text layer — looks like a scanned/image PDF. Open it, copy the text and paste it below."
          : /\.(png|jpg|jpeg|gif|webp|dwg|dxf)$/.test(lower)
            ? "unsupported type — use PDF/DOCX/TXT/MD, or paste the text."
            : "no extractable text — paste the text instead.";
        skipped.push(`${file.name} — ${reason}`);
        continue;
      }
      await addDocument(orgId, { projectId, name: file.name, docType, content });
      added += 1;
    } catch (e) {
      skipped.push(`${file.name} — ${(e as Error).message}`);
    }
  }
  if (pasted) {
    await addDocument(orgId, { projectId, name: "Pasted brief", docType, content: pasted });
    added += 1;
  }
  if (added === 0) {
    throw new Error(skipped.length ? `No documents added — ${skipped.slice(0, 3).join("; ")}` : "Choose files or paste text.");
  }
  return { added, skipped };
}

export async function archiveDocumentAction(documentId: string) {
  return archiveDocument(await requireOrgId(), documentId);
}

export async function generateConceptAction(projectId: string) {
  const orgId = await requireOrgId();
  // When AI is configured, Claude reads the documents; otherwise rule-based extraction.
  return isAiConfigured() ? generateConceptAI(orgId, projectId) : generateConcept(orgId, projectId);
}

export async function transitionDrawingAction(drawingId: string, to: LifecycleState) {
  return transitionDrawing(await requireOrgId(), drawingId, to);
}

export async function sendCopilotAction(projectId: string, content: string) {
  return sendCopilotMessage(await requireOrgId(), projectId, content);
}

export async function designFromBriefAction(projectId: string, brief: string) {
  return designFromBrief(await requireOrgId(), projectId, brief);
}

/** DXF edit copilot — stateless: turn an instruction into edit operations (no DB). */
export async function dxfCopilotAction(summary: ModelSummary, instruction: string) {
  return editDxf(summary, instruction);
}

/**
 * PDF → DXF conversion. Accepts a vector PDF and returns an editable DxfModel the
 * editor loads exactly like an uploaded DXF (then copilot + export work unchanged).
 * Stateless — no DB; the model lives client-side until the user exports it.
 */
export async function pdfToDxfAction(formData: FormData) {
  await requireOrgId(); // gate on an active tenant, matching the rest of the app
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a PDF file to convert.");
  if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("That isn't a PDF — upload a .pdf exported from your CAD tool.");
  const scaleRaw = Number(formData.get("scale"));
  const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1;
  const pages = parsePageSelection(String(formData.get("pages") ?? ""));

  const buf = Buffer.from(await file.arrayBuffer());
  const { pages: converted, stats, pageReport, warning } = await pdfToModel(buf, { scale, pages });
  if (converted.length === 0) {
    throw new Error(warning ?? "No convertible vector geometry was found in that PDF.");
  }
  return { pages: converted, stats, pageReport, warning };
}

/** Parse the UI "pages" field: "" / "auto" → auto-detect; "all" → every page; "3-5,8" → list. */
function parsePageSelection(raw: string): PageSelection {
  const s = raw.trim().toLowerCase();
  if (!s || s === "auto") return "auto";
  if (s === "all") return "all";
  const nums = new Set<number>();
  for (const part of s.split(",")) {
    const range = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      for (let n = Math.min(a, b); n <= Math.max(a, b); n++) nums.add(n);
    } else if (/^\d+$/.test(part.trim())) {
      nums.add(Number(part.trim()));
    }
  }
  return nums.size ? [...nums] : "auto";
}
