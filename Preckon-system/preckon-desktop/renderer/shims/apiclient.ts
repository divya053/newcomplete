// The tenant API, reached through the main process.
//
// Same shape as the web app's client, so the components calling it are
// unmodified — which is how the drawing Copilot, the BIM agent, save-to-project
// and the takeoff all work here without being reimplemented. They are the same
// code making the same calls.
//
// The request itself is made in the main process, not here. The renderer's
// origin is app://preckon; a fetch to the workspace from this side would be
// cross-origin, would carry no session cookie, and would need the page to be
// allowed to reach the network at all. Routing it through IPC means the page's
// CSP can go on saying `connect-src 'self'` truthfully.

/**
 * Turn whatever arrived into something a person can read.
 *
 * Kept in step with the web client deliberately. This shim exists so the shared
 * components are unmodified, and a helper present on one side but not the other
 * breaks that promise — which is exactly how this was found: the build failed
 * the moment panel.tsx imported it.
 *
 * More to the point, the desktop went on printing the literal text
 * "[object Object]" in BIM Studio after the web client had stopped, because the
 * fix went into the web client and this file was never touched. `super(message)`
 * coerces with String(), so an object message becomes that text and the real
 * failure is invisible.
 */
export function readableMessage(v: unknown, fallback: string): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v == null) return fallback;
  if (Array.isArray(v)) {
    const joined = v.map((x) => readableMessage(x, "")).filter(Boolean).join("; ");
    return joined || fallback;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["message", "detail", "error", "reason", "summary", "text"]) {
      const got = readableMessage(o[k], "");
      if (got) return got;
    }
    try {
      const s = JSON.stringify(v);
      if (s && s !== "{}") return s.length > 400 ? `${s.slice(0, 400)}…` : s;
    } catch { /* circular — fall through */ }
    return fallback;
  }
  return String(v);
}

export class ApiClientError extends Error {
  constructor(public code: string, message: unknown, public status: number, public details?: unknown) {
    super(readableMessage(message, "Request failed"));
    this.name = "ApiClientError";
  }
}

const bridge = () => (window as any).preckon ?? null;

/** Set when a call comes back 401, so the shell can offer to sign in rather
 *  than showing "Request failed (401)" in the middle of a drawing. */
type Listener = () => void;
const needSignIn = new Set<Listener>();
export const onSignInNeeded = (fn: Listener) => { needSignIn.add(fn); return () => needSignIn.delete(fn); };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const b = bridge();
  if (!b) throw new ApiClientError("offline", "This page is not running in the Preckon desktop app.", 0);

  const res = await b.workspace.request(method, path, body);
  if (res.ok) return res.data as T;

  if (res.status === 401) for (const fn of needSignIn) fn();
  throw new ApiClientError(res.code, res.message, res.status);
}

export const api = {
  get: <T = any>(path: string) => request<T>("GET", path),
  post: <T = any>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T = any>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T = any>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T = any>(path: string) => request<T>("DELETE", path),

  /* A File cannot cross the IPC boundary, but a DXF is text and text can. Read
     here, assembled into multipart on the other side. */
  upload: async <T = any>(path: string, file: File): Promise<T> => {
    const b = bridge();
    if (!b) throw new ApiClientError("offline", "This page is not running in the Preckon desktop app.", 0);
    const res = await b.workspace.upload(path, file.name, await file.text(), file.type);
    if (res.ok) return res.data as T;
    if (res.status === 401) for (const fn of needSignIn) fn();
    throw new ApiClientError(res.code, res.message, res.status);
  },
};
