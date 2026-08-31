import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Edge auth guard for the console. This is an OPTIMISTIC check — it only looks
// for the presence of the Better Auth session cookie so unauthenticated requests
// are bounced at the edge (no flash of the authed shell, no console HTML served
// to anonymous users). The real authorization boundary is still getAuthContext()
// on every API route (§0.5); this does not replace it.

// Public routes that must render without a session.
const PUBLIC = new Set(["/", "/forgot-password", "/reset-password"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /* Registration is closed.
   *
   * This console is staff-only and invite-based — there is no register screen
   * and nothing links to one. Better Auth still mounted POST /sign-up/email
   * anyway, and on production it answered 200: anyone on the internet could
   * create an account on the platform operations console, and one probe did.
   *
   * `emailAndPassword.disableSignUp` would close it for everyone including the
   * seed, which creates the first Owner through this very endpoint (it runs in
   * its own container and reaches the app over HTTP, so no static config can
   * tell it apart from a stranger). A shared secret can.
   *
   * The token never leaves the compose network. A request from outside cannot
   * have it, and the app listens only on loopback behind nginx, so the header
   * cannot be injected by anything but the proxy itself.
   */
  if (pathname.startsWith("/api/auth/sign-up")) {
    const expected = process.env.INTERNAL_SERVICE_TOKEN;
    const offered = request.headers.get("x-internal-token");
    // No token configured means no way to authorise a signup, so none is
    // authorised. Failing closed is the only safe direction here.
    if (!expected || offered !== expected) {
      return new NextResponse(
        JSON.stringify({ error: "Registration is closed. Staff accounts are created by invitation." }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }
    return NextResponse.next();
  }

  // Never touch auth endpoints, Next internals, or public auth pages.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    PUBLIC.has(pathname)
  ) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    // Preserve where they were headed so we can bounce back after login later.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Run on everything except static assets and files with an extension.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
