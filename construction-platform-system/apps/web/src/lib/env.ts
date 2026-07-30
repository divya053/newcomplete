import { z } from "zod";

/**
 * Config validated at BOOT — fail fast (ws 0.6, guardrail #10). A missing/invalid
 * secret throws at startup, not at first use. App code reads from `env`, NEVER
 * process.env directly. Secrets are env-injected from the manager (the source is
 * an open decision — design behind this seam, swap later without code changes).
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_BASE_URL: z.string().url().default("http://localhost:3000"),
  ANTHROPIC_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  AI_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  // TenderLogix (the AutoCAD-BOQ-Tender app) is run as a federated service and
  // embedded in the platform shell. URL of its web UI (Vite dev server in local dev).
  TENDERLOGIX_URL: z.string().url().default("http://localhost:5173"),
});

// Throws at boot if anything is missing/invalid.
export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
