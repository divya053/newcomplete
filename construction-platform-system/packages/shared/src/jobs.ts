import { z } from "zod";

/**
 * The job contract — the ONLY thing that crosses runtimes (ws 0.1, guardrail #1/#9).
 * TS enqueues a JobEnvelope to Redis (arq format); the Python worker consumes it,
 * runs an agent, and writes back a JobResult. The result is a PROPOSAL — the TS
 * domain decides what to persist and in which lifecycle state.
 *
 * Phase 0 ships exactly one job type, `noop_probe`, to prove the seam round-trips.
 * Agent job types (extraction, takeoff, pricing, ...) are added Phase 3+.
 */

export const JOB_TYPES = ["noop_probe", "tender_cad_extract", "tender_boq_generate", "drawlogix_generate"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export interface JobEnvelope<T = unknown> {
  jobId: string; // uuid v4/v7
  type: JobType; // Phase 0 only; agent job types added Phase 3+
  orgId: string; // the tenant context travels WITH the job (never trust the worker to infer it)
  correlationId: string; // request trace id — threaded across runtimes for end-to-end tracing
  payload: T; // validated against a Zod schema before enqueue
  idempotencyKey: string; // same key => at-most-once effect
}

export interface JobResult<R = unknown> {
  jobId: string;
  status: "done" | "failed";
  result?: R; // a PROPOSAL — the domain decides what to persist
  error?: { code: string; message: string };
}

/** Payload schemas, keyed by job type. Validate BEFORE enqueue (guardrail #6). */
export const noopProbePayloadSchema = z.object({
  echo: z.string().max(256).default("ping"),
});
export type NoopProbePayload = z.infer<typeof noopProbePayloadSchema>;

/**
 * TenderLogix — CAD/document extraction (Python AI tier, services/ai). The worker
 * parses one uploaded document (ezdxf/PyMuPDF) and returns a PROPOSAL: a summary +
 * chunks. The TS domain decides what to persist into tender_cad_extractions /
 * tender_cad_chunks under the tenant context. The worker NEVER writes domain state.
 */
export const tenderCadExtractPayloadSchema = z.object({
  documentId: z.string().uuid(),
  projectId: z.string().uuid(),
  fileKey: z.string().min(1), // object-store key of the uploaded file
  mode: z.enum(["drawing", "document"]),
});
export type TenderCadExtractPayload = z.infer<typeof tenderCadExtractPayloadSchema>;

/**
 * TenderLogix — multi-agent BOQ generation (Python AI tier). Consumes the project's
 * extracted chunks + SOW outline and returns a PROPOSAL: priced BOQ line items with
 * confidence + drawing-reference citations. The domain persists them as
 * tender_boq_items in the `ai_generated` lifecycle state for QS review.
 */
export const tenderBoqGeneratePayloadSchema = z.object({
  projectId: z.string().uuid(),
  model: z.string().min(1).default("claude-opus-4-8"),
  provider: z.enum(["anthropic", "openai", "openrouter", "groq", "ollama"]).default("anthropic"),
});
export type TenderBoqGeneratePayload = z.infer<typeof tenderBoqGeneratePayloadSchema>;

/**
 * DrawLogix — concept generation (Python AI tier). Consumes a drawing project's
 * documents (SOW / interview / spec) and returns a PROPOSAL: a structured
 * requirement list + a concept (area schedule + an SVG floor-plan), each element
 * traceable to a requirement. The TS domain persists the proposal as `ai_generated`
 * requirements + a drawing artifact for engineer review. The AI tier writes no state.
 */
export const drawlogixGeneratePayloadSchema = z.object({
  projectId: z.string().uuid(),
  provider: z.enum(["anthropic", "openai", "openrouter", "groq", "ollama"]).default("anthropic"),
  model: z.string().min(1).default("claude-opus-4-8"),
});
export type DrawlogixGeneratePayload = z.infer<typeof drawlogixGeneratePayloadSchema>;

export const jobPayloadSchemas = {
  noop_probe: noopProbePayloadSchema,
  tender_cad_extract: tenderCadExtractPayloadSchema,
  tender_boq_generate: tenderBoqGeneratePayloadSchema,
  drawlogix_generate: drawlogixGeneratePayloadSchema,
} satisfies Record<JobType, z.ZodTypeAny>;

/** The Redis list (arq queue name) the seam uses. */
export const JOB_QUEUE = "ci:jobs";
/** The Redis key prefix where a worker writes a JobResult back. */
export const JOB_RESULT_PREFIX = "ci:result:";
