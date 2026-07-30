import { randomUUID } from "node:crypto";
import {
  JOB_QUEUE,
  JOB_RESULT_PREFIX,
  type JobEnvelope,
  type JobResult,
  type JobType,
  jobPayloadSchemas,
} from "@ci/shared";
import Redis from "ioredis";
import { env } from "./env";

/**
 * The thin typed TS queue client — the TS half of the seam (ws 0.1). Validates the
 * payload (guardrail #6), stamps the envelope (tenant + correlation travel WITH the
 * job — guardrail #1), and writes an arq-format payload to Redis. The Python worker
 * consumes it and writes a JobResult back under JOB_RESULT_PREFIX + jobId.
 *
 * Settle-in-build (§Appendix): we write arq payloads to Redis directly from here,
 * keeping the seam thin. No direct TS→Python calls, ever.
 */
const redis = new Redis(env.REDIS_URL);

export interface EnqueueOpts {
  orgId: string;
  correlationId: string;
  idempotencyKey?: string;
}

export async function enqueue<T extends JobType>(
  type: T,
  rawPayload: unknown,
  opts: EnqueueOpts,
): Promise<string> {
  const payload = jobPayloadSchemas[type].parse(rawPayload); // validate at the boundary
  const envelope: JobEnvelope = {
    jobId: randomUUID(),
    type,
    orgId: opts.orgId,
    correlationId: opts.correlationId,
    idempotencyKey: opts.idempotencyKey ?? randomUUID(),
    payload,
  };
  // arq consumes a JSON-encoded job from the queue list.
  await redis.rpush(JOB_QUEUE, JSON.stringify({ function: type, args: [envelope] }));
  return envelope.jobId;
}

/** Poll for a worker's result (Phase 0 demo helper for the seam round-trip). */
export async function awaitResult<R = unknown>(jobId: string, timeoutMs = 10_000): Promise<JobResult<R> | null> {
  const key = JOB_RESULT_PREFIX + jobId;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await redis.get(key);
    if (raw) return JSON.parse(raw) as JobResult<R>;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}
