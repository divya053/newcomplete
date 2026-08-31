import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { pool } from "./db";
import { email } from "./integrations";
import { MIN_PASSWORD_LENGTH } from "./constants";

/**
 * Tenant-plane Better Auth instance (§1.1). Owns credentials/sessions for tenant
 * users. The authorization profile (tenant, roles, status) lives in `app_user`,
 * linked by app_user.auth_user_id = user.id. Separate identity pool from the Host.
 */
export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3100",
  trustedOrigins: (request?: Request) => {
    const configured = process.env.BETTER_AUTH_URL ?? "http://localhost:3100";
    const base = [configured, "http://localhost:3100", "http://127.0.0.1:3100"];
    const origin = request?.headers?.get?.("origin") ?? "";
    if (
      origin &&
      /^https?:\/\/(localhost|127\.0\.0\.1|(?:192\.168|10|172\.(?:1[6-9]|2\d|3[01]))\.\d+\.\d+)(?::\d+)?$/.test(
        origin
      )
    )
      return [...new Set([...base, origin])];
    return base;
  },
  // Better Auth throttles sign-in in production, which is what we want against
  // credential stuffing. But the e2e suite signs in once per test and trips it
  // after three, so the ceiling is env-tunable. Unset — as on any real
  // deployment — the strict default stands.
  rateLimit: {
    customRules: {
      "/sign-in/email": { window: 60, max: Number(process.env.AUTH_SIGNIN_MAX ?? 3) },
      // Sends mail to an address the requester names. Unthrottled, it is a way
      // to have us repeatedly mail somebody on request.
      "/forget-password": { window: 300, max: 3 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
      "/two-factor/verify-totp": { window: 300, max: 6 },
    },
  },

  /* WHO a request came from, which decides whose bucket it counts against.
   *
   * The limiter above is keyed on the client IP, and behind nginx every socket
   * says 127.0.0.1. Better Auth then does what it warns it will do: "falls back
   * to a single shared per-path bucket."
   *
   * One bucket for everybody is worse than none. Three sign-ins a minute shared
   * across a whole construction firm means one script locks out every estimator
   * in the company, and a credential-stuffing run looks identical to Monday
   * morning.
   *
   * These two headers are safe to trust HERE and nowhere else: this app binds
   * to 127.0.0.1, so nginx is the only thing that can reach it, so the only
   * x-real-ip it can ever see is one nginx wrote. x-real-ip first, because it
   * is a single address where x-forwarded-for is a list a client can prepend
   * to. */
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-real-ip", "x-forwarded-for"],
    },
  },
  /* Second factor: TOTP, with single-use backup codes.
   *
   * The protocol is Better Auth's rather than ours, deliberately — a
   * hand-rolled TOTP is the kind of code that looks right, passes its own
   * tests, and is subtly wrong about clock skew or replay.
   *
   * `skipVerificationOnEnable` is left OFF: a user must prove the code works
   * before the factor is switched on. Enabling first and verifying later locks
   * out anybody whose authenticator was set up wrong, and they cannot use the
   * second factor to recover from having a broken second factor.
   */
  plugins: [
    twoFactor({
      issuer: process.env.MFA_ISSUER ?? "Preckon",
      backupCodeOptions: { amount: 10, length: 10 },
    }),
  ],

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    sendResetPassword: async ({ user, url }) => {
      await email.send({
        to: user.email,
        subject: "Reset your Preckon password",
        body: `Reset your password: ${url}\n\nIf you didn't request this, ignore this email.`,
      });
      if (process.env.NODE_ENV !== "production") {
        console.info(`[auth] password reset link for ${user.email}: ${url}`);
      }
    },
    resetPasswordTokenExpiresIn: 60 * 60,
  },
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
  },
});

export type Auth = typeof auth;
