import { betterAuth } from "better-auth";
import { pool } from "./db";
import { email } from "./integrations";
import { MIN_PASSWORD_LENGTH } from "./constants";

/**
 * Host-only Better Auth instance (§1.1). Owns credentials/sessions for TechSME
 * staff. The staff profile (role, status) lives in `host_user`, linked by
 * host_user.auth_user_id = user.id. This is a *separate identity pool* from the
 * tenant plane (§0.2) — tenant users never appear here.
 */
export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  // Trust the configured URL plus any localhost / 127.0.0.1 / private-LAN origin
  // during local dev, so signing in works whether you open the app at
  // localhost:3000, 127.0.0.1:3000, or http://<your-LAN-ip>:3000. The function
  // is sometimes invoked without a request, so guard for that.
  trustedOrigins: (request?: Request) => {
    const configured = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    // `http://app:3000` is the in-cluster origin the docker-compose `seed` service
    // uses to reach this app by service name — trust it so seed:owner's sign-up
    // isn't rejected as INVALID_ORIGIN. Browser logins still use localhost:3000.
    const base = [configured, "http://localhost:3000", "http://127.0.0.1:3000", "http://app:3000"];
    const origin = request?.headers?.get?.("origin") ?? "";
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1|(?:192\.168|10|172\.(?:1[6-9]|2\d|3[01]))\.\d+\.\d+)(?::\d+)?$/.test(origin))
      return [...new Set([...base, origin])];
    return base;
  },
  emailAndPassword: {
    enabled: true,
    // Staff are invited, not self-signup — the console has no public register.
    autoSignIn: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    // "Forgot password" flow. Better Auth mints a one-time token and calls this
    // with a ready-made reset URL (see BETTER_AUTH_URL + the /reset-password page).
    // With no live EMAIL_API_KEY the send is mocked and the link is logged to the
    // server console (§9) — copy it from there in local dev.
    sendResetPassword: async ({ user, url }) => {
      await email.send({
        to: user.email,
        subject: "Reset your Preckon Host password",
        body:
          `A password reset was requested for your Preckon Host account.\n\n` +
          `Reset your password: ${url}\n\n` +
          `If you didn't request this, you can ignore this email. The link expires in 1 hour.`,
      });
      // Dev convenience only — never print reset tokens to production logs.
      if (process.env.NODE_ENV !== "production") {
        console.info(`[auth] password reset link for ${user.email}: ${url}`);
      }
    },
    resetPasswordTokenExpiresIn: 60 * 60, // 1h
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12h, mirrors security.session_max_hours default
    updateAge: 60 * 60,
  },

  /* WHO a request came from.
   *
   * Rate limiting is keyed on the client IP, and behind nginx the socket
   * address is always 127.0.0.1. Better Auth says what happens then, in its own
   * words: "Rate limiting could not determine a client IP and is falling back
   * to a single shared per-path bucket."
   *
   * One bucket for everybody is worse than none. Three sign-in attempts per ten
   * seconds shared across the whole company means one script locks out every
   * member of staff, and a brute-force attempt is indistinguishable from the
   * morning rush.
   *
   * nginx already sets both of these headers on every proxied request. They are
   * safe to trust HERE and nowhere else: the app binds to 127.0.0.1, so nginx
   * is the only thing that can reach it, so the only X-Real-IP it can ever see
   * is one nginx wrote. x-real-ip first — it is a single address, where
   * x-forwarded-for is a list a client can prepend to. */
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-real-ip", "x-forwarded-for"],
    },
  },

  /* Enabled by default in production, but stated here so it is visible and so
   * the sign-in rule is ours rather than inherited.
   *
   * 5 per minute on sign-in, against a default of 3 per 10 seconds. Slower over
   * a minute (a password sprayer gets 5 tries, not 18) and kinder to a person
   * who mistypes twice and then reaches for their password manager.
   *
   * Password reset is the tightest: it sends mail to an address the requester
   * names, so an unthrottled endpoint is a way to have us mail somebody
   * repeatedly on request. */
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/forget-password": { window: 300, max: 3 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
      "/change-password": { window: 300, max: 5 },
    },
  },
});

export type Auth = typeof auth;
