import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/**
 * Better Auth's HTTP surface, minus registration.
 *
 * ── WHY THE WRAPPER ──────────────────────────────────────────────────────────
 *
 * This workspace has no sign-up screen. People are invited by an admin, and
 * every account is created through `auth.api.signUpEmail(...)` from iam.ts and
 * provisioning.ts — a server-side call, in-process, which never touches this
 * route.
 *
 * Better Auth mounted POST /api/auth/sign-up/email anyway, and on production it
 * answered 200. Anyone on the internet could create themselves an account on a
 * customer's workspace. A probe did, and had to be deleted from the live
 * database.
 *
 * `emailAndPassword.disableSignUp` is not the fix: that flag is checked inside
 * the sign-up handler, which `auth.api.signUpEmail` runs too, so setting it
 * would also break the invite flow and tenant provisioning. Closing the door at
 * the HTTP layer leaves the in-process call exactly as it was.
 */
const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(req: Request) {
  /* Matched on the path rather than the body, because the body is a stream that
     can only be read once — consuming it here would leave Better Auth with
     nothing to parse on every other endpoint. */
  if (new URL(req.url).pathname.includes("/sign-up")) {
    return Response.json(
      { error: "Registration is closed. Ask an administrator to invite you." },
      { status: 403 },
    );
  }
  return handlers.POST(req);
}
