import type { Permission } from "@ci/shared";
import type { RequestContext } from "./context";
import { ForbiddenError } from "./errors";

/**
 * The server-side authorization guard (ws 0.3, guardrail #3). Permissions are
 * checked SERVER-SIDE ONLY, always against the resolved set that came from the
 * catalog in @ci/shared — never an ad-hoc string. The UI may hide controls, but
 * the server is the only place access is decided.
 */
export function requirePermission(ctx: RequestContext, perm: Permission): void {
  if (!ctx.permissions.has(perm)) throw new ForbiddenError(perm);
}

/** Platform-owner gate: the active org must be the host (TechSME) and the caller an admin. */
export function requireHost(ctx: RequestContext): void {
  if (!ctx.isHost) throw new ForbiddenError("platform host only");
}
