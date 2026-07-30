import { z } from "zod";

/**
 * TenderLogix domain types + boundary input schemas. Validation (Zod) happens at the
 * boundary of every use-case (guardrail #6) — nothing unvalidated reaches the repo.
 */

export const CreateProjectInput = z.object({
  name: z.string().min(1).max(255),
  client: z.string().max(255).optional(),
  location: z.string().max(255).optional(),
  quotationRef: z.string().max(255).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const GenerateBoqInput = z.object({
  projectId: z.string().uuid(),
  provider: z.enum(["anthropic", "openai", "openrouter", "groq", "ollama"]).default("anthropic"),
  model: z.string().min(1).default("claude-opus-4-8"),
});
export type GenerateBoqInput = z.infer<typeof GenerateBoqInput>;

export const ApproveBoqLineInput = z.object({
  boqItemId: z.string().uuid(),
});
export type ApproveBoqLineInput = z.infer<typeof ApproveBoqLineInput>;

export interface TenderProjectEntity {
  id: string;
  orgId: string;
  name: string;
  status: string;
  client: string | null;
  createdAt: Date;
}
