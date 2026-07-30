"use server";

import { randomUUID } from "node:crypto";
import { awaitResult, enqueue } from "@/lib/queue";

/**
 * The seam demo (EXIT GATE #1). Enqueues a noop_probe job and waits for the Python
 * worker to write the result back — proving TS → Redis → Python → TS round-trips.
 * This is the ONLY job Phase 0 ships; it carries no domain effect.
 *
 * In Phase 0 this runs without a full session (the seam predates auth); from Phase
 * 3 every real job goes through the validate→authorize→tenant-scope→work→audit
 * spine like any other operation.
 */
export async function runNoopProbe(echo: string): Promise<{ ok: boolean; echo?: string; jobId: string }> {
  const correlationId = randomUUID();
  const orgId = "00000000-0000-0000-0000-000000000000"; // Phase 0 probe uses a sentinel tenant
  const jobId = await enqueue("noop_probe", { echo }, { orgId, correlationId });
  const result = await awaitResult<{ echo: string }>(jobId);
  return { ok: result?.status === "done", echo: result?.result?.echo, jobId };
}
