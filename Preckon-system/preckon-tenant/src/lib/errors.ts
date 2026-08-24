// §X.2 error envelope + canonical status-code map. (No next/server import here so
// the store/runtime import graph stays usable under plain Node / vitest.)
export type ErrorCode =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "entitlement_required"
  | "seat_limit"
  | "usage_limit"
  | "not_found"
  | "version_conflict"
  | "stale_artifact"
  | "schema_invalid"
  | "rate_limited"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  entitlement_required: 403,
  seat_limit: 403,
  usage_limit: 402,
  not_found: 404,
  version_conflict: 409,
  stale_artifact: 409,
  schema_invalid: 422,
  rate_limited: 429,
  internal: 500,
};

export class ApiError extends Error {
  code: ErrorCode;
  details: Record<string, unknown>;
  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const errUnauthenticated = (m = "Authentication required") =>
  new ApiError("unauthenticated", m);
export const errForbidden = (permission: string) =>
  new ApiError("forbidden", `Missing permission: ${permission}`, { permission });
export const errEntitlement = (m = "Not licensed for this capability") =>
  new ApiError("entitlement_required", m);
export const errNotFound = (what = "Resource") => new ApiError("not_found", `${what} not found`);
export const errConflict = (m: string, details = {}) => new ApiError("version_conflict", m, details);
export const errStale = (m = "Artifact is superseded or stale") =>
  new ApiError("stale_artifact", m);
export const errSchema = (m: string, details = {}) => new ApiError("schema_invalid", m, details);
/**
 * Pull a readable sentence out of whatever an upstream service returned.
 *
 * `new Error(someObject)` coerces with String(), producing the literal text
 * "[object Object]" — and that then travels the whole way out: into the error
 * envelope, into the log line, and onto the user's screen, with the real cause
 * discarded at the first step.
 *
 * That is not hypothetical. Every failed BIM Studio request logged
 * `"message":"[object Object]"` server-side, because the Anthropic error shape
 * is {type, error:{type, message}} and the object was handed straight to an
 * Error constructor. The actual reason was never recorded anywhere.
 *
 * So: look where a message is likely to be — including one nested level, which
 * is exactly where provider errors put it — and serialise as a last resort. A
 * JSON blob is ugly; "[object Object]" is useless.
 */
export function readableCause(v: unknown, fallback: string): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v == null) return fallback;
  if (Array.isArray(v)) {
    const joined = v.map((x) => readableCause(x, "")).filter(Boolean).join("; ");
    return joined || fallback;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["message", "detail", "description", "reason", "summary", "text"]) {
      const got = readableCause(o[k], "");
      if (got) return got;
    }
    // Nested: {error:{message}}, {data:{message}} — the provider convention.
    for (const k of ["error", "data", "body"]) {
      if (o[k] && typeof o[k] === "object") {
        const got = readableCause(o[k], "");
        if (got) return got;
      }
    }
    try {
      const s = JSON.stringify(v);
      if (s && s !== "{}") return s.length > 500 ? `${s.slice(0, 500)}…` : s;
    } catch { /* circular — fall through */ }
    return fallback;
  }
  return String(v);
}

export const errBadRequest = (m: unknown, details = {}) =>
  new ApiError("bad_request", readableCause(m, "Bad request"), details);

/** Map any thrown value to a {status, body} envelope (§X.2). Framework-agnostic. */
export function toErrorEnvelope(err: unknown): { status: number; body: unknown } {
  if (err instanceof ApiError) {
    return {
      status: STATUS[err.code],
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }
  const anyErr = err as any;
  if (anyErr?.name === "ZodError") {
    return {
      status: 400,
      body: { error: { code: "bad_request", message: "Validation failed", details: { issues: anyErr.issues } } },
    };
  }
  console.error("[unhandled]", err);
  return {
    status: 500,
    body: { error: { code: "internal", message: "Internal server error", details: {} } },
  };
}
