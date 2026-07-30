import { z } from "zod";

/** Boundary input for creating a new organization (tenant). */
export const CreateOrgInput = z.object({
  name: z.string().min(1).max(120),
});
export type CreateOrgInput = z.infer<typeof CreateOrgInput>;
