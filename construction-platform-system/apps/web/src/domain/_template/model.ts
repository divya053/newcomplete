import { z } from "zod";

/**
 * Domain types + boundary input schemas. Validation (Zod) happens at the boundary
 * of every use-case (guardrail #6) — nothing unvalidated reaches the repository.
 */
export const PublishExampleInput = z.object({
  id: z.string().uuid(),
});
export type PublishExampleInput = z.infer<typeof PublishExampleInput>;

export interface ExampleEntity {
  id: string;
  orgId: string;
  state: string;
}
