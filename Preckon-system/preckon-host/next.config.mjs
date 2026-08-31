/** @type {import('next').NextConfig} */

/* ── Security headers ────────────────────────────────────────────────────────
 *
 * WHY THIS EXISTS. A reCAPTCHA was appearing on the console that this codebase
 * has never contained — there is no captcha integration anywhere in the host,
 * and the HTML nginx serves carries no captcha markup. A challenge that appears
 * in a page the server did not put there was injected between the server and
 * the browser, and until now nothing stopped that:
 *
 *   Strict-Transport-Security   MISSING
 *   Content-Security-Policy     MISSING
 *   X-Frame-Options             MISSING
 *   X-Content-Type-Options      MISSING
 *   Referrer-Policy             MISSING
 *
 * Two holes let it in, and both are closed here.
 *
 * THE PLAIN-HTTP WINDOW. nginx redirects http -> https correctly, but the
 * redirect itself travels unencrypted. Every first visit of every session makes
 * one cleartext round trip before any TLS exists, and anything on the path —
 * a captive portal, a mobile carrier's proxy, a transparent middlebox — can
 * answer it with a page of its own. HSTS removes the window: after one HTTPS
 * response the browser rewrites http:// to https:// itself and never emits the
 * cleartext request again.
 *
 * THE INJECTION ITSELF. This app loads no third-party SCRIPT at all — no CDN
 * bundle, no analytics, no tag manager. Its only cross-origin requests are two
 * font stylesheets. So `script-src 'self'` costs nothing here and a third
 * party's script cannot execute regardless of who put the tag in the page, and
 * `frame-src 'none'` stops the iframe a challenge widget actually renders in.
 *
 * The font origins were found by loading the console in a real browser and
 * reading the violations — they are @import lines inside globals.css, which a
 * grep of the TSX sources does not see. Any future change to this policy should
 * be checked the same way rather than by reading the source.
 *
 * ON 'unsafe-inline'. layout.tsx carries one inline script — the pre-paint
 * theme read, which must run before first paint or the console flashes the
 * wrong theme. A nonce is the better answer and is a follow-up: it means
 * threading a per-request value from middleware through headers() into the tag,
 * which makes every page dynamic and is a change worth testing on its own.
 * 'unsafe-inline' permits inline script but NOT cross-origin script, so the
 * vector that produced the captcha is closed either way. This is a real
 * weakening and it is scoped to exactly one known script.
 */

const csp = [
  "default-src 'self'",
  // No external script host is listed, so an injected third-party tag cannot run.
  "script-src 'self' 'unsafe-inline'",
  /* globals.css @imports two font stylesheets. Listing the exact origins keeps
     the policy closed to everything else; a bare 'self' here blocks the fonts
     and the console renders in a fallback face.
     Self-hosting them would remove both entries, drop two third-party requests
     from every page load, and take the policy back to fully first-party. That
     is the better end state and it is a separate change. */
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com https://api.fontshare.com",
  // The console talks only to its own origin.
  "connect-src 'self'",
  // A challenge widget renders in an iframe. Nothing here needs one.
  "frame-src 'none'",
  "object-src 'none'",
  // Clickjacking: the modern form, honoured alongside X-Frame-Options.
  "frame-ancestors 'none'",
  // Stops an injected <base> retargeting every relative URL on the page.
  "base-uri 'self'",
  // A form on this page can only post back to this origin.
  "form-action 'self'",
  // Any http:// subresource that survives is fetched over https instead.
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    /* Two years, and subdomains included: a single subdomain reachable over
       plain http is a re-entry point for the same injection. `preload` is
       deliberately NOT set — that submits the domain to a list baked into
       browsers and is effectively irreversible, so it belongs to a decision
       made on purpose once every subdomain is known to be HTTPS-only. */
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "Content-Security-Policy", value: csp },
  // Legacy twin of frame-ancestors, for browsers that predate CSP level 2.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops a browser second-guessing Content-Type and running an upload as script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never leak a console path or query string to another origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // A tenant console needs none of these; denying them shrinks what an injected
  // script could ask the browser for.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // Isolates this origin's browsing context group from anything it opens.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) so the Docker runtime
  // image only carries Node + traced deps, not the whole node_modules.
  output: "standalone",
  // Hide the dev-only "Static/Dynamic route" indicator badge (bottom corner).
  devIndicators: { appIsrStatus: false, buildActivity: false },
  // Better Auth + mysql2 are server-only; keep them out of the client bundle.
  serverExternalPackages: ["mysql2", "better-auth"],

  // Don't advertise the framework and its version to a scanner.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
