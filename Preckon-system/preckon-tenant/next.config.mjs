/** @type {import('next').NextConfig} */

/* ── Security headers ────────────────────────────────────────────────────────
 *
 * The same set the host console got, for the same reason: a reCAPTCHA appeared
 * on a page this codebase never put one on, injected between the server and the
 * browser, and nothing here stopped it. app.preckon.com was serving no HSTS, no
 * CSP, no X-Frame-Options and no nosniff.
 *
 * THE PLAIN-HTTP WINDOW. nginx redirects http -> https, but the redirect itself
 * travels unencrypted. Every first visit makes one cleartext round trip before
 * any TLS exists, and anything on the path can answer it with a page of its own.
 * HSTS closes that window after a single HTTPS response.
 *
 * WHAT THIS APP LOADS. Checked rather than assumed: two font stylesheets, and
 * nothing else cross-origin. No CDN bundle, no analytics, no tag manager, no
 * iframes, no web workers. The blob: URLs are file downloads (a DXF export, a
 * programme export) built with createObjectURL and hung off an anchor.
 *
 * So `script-src 'self'` costs this app nothing and an injected third-party tag
 * cannot run, whoever put it in the page.
 *
 * ON 'unsafe-inline'. layout.tsx carries one inline script — the pre-paint theme
 * read, which must run before first paint or the workspace flashes the wrong
 * theme. 'unsafe-inline' permits inline script but NOT cross-origin script, so
 * the vector that produced the captcha is closed either way. A nonce is the
 * better answer and is a follow-up: it makes every page dynamic, which on a
 * workspace this size deserves testing on its own.
 */

const csp = [
  "default-src 'self'",
  // No external script host. An injected tag has nowhere to load from.
  "script-src 'self' 'unsafe-inline'",
  /* globals.css @imports two font stylesheets. Naming the exact origins keeps
     everything else shut out. Self-hosting them would remove both entries and
     take this back to fully first-party; that is the better end state and a
     separate change. */
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
  // blob: for the CAD canvas and the exports; data: for inline sheet previews.
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com https://api.fontshare.com",
  "connect-src 'self'",
  // Nothing in this app embeds anything, and a challenge widget renders in an
  // iframe — so denying frames costs nothing and closes that door.
  "frame-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Stops an injected <base> retargeting every relative URL on the page.
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    /* Two years, subdomains included: one subdomain on plain http is a re-entry
       point for the same injection. `preload` is deliberately NOT set — it bakes
       the domain into browsers and is effectively irreversible, so it belongs to
       a decision made once every subdomain is known to be HTTPS-only. */
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  // Stops a browser second-guessing Content-Type and running an upload as
  // script. This app accepts drawings and tender packs from strangers.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // A project path or a tender name must not leak to another origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // pdf-parse is a CommonJS lib with an optional debug harness; keep it external
  // so Next doesn't try to bundle its test fixtures.
  serverExternalPackages: ["mysql2", "pdf-parse"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },

  // Don't advertise the framework and its version to a scanner.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
