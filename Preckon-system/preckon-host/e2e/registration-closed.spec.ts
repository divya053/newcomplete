// The console does not let strangers make accounts.
//
// ── WHAT THIS PINS ───────────────────────────────────────────────────────────
//
// This console is staff-only and invite-based. There is no register screen and
// nothing links to one — but Better Auth mounted POST /sign-up/email anyway,
// and in production it answered 200. Anyone on the internet could create an
// account on the platform operations console, and a probe did exactly that
// before this was closed.
//
// `emailAndPassword.disableSignUp` was not usable: the seed creates the first
// Owner through this same endpoint, from its own container over HTTP, so no
// static flag can tell it from a stranger. A shared secret can, and does.
//
// The rate-limit tests below matter for a subtler reason. Better Auth keys its
// limiter on the client IP, and behind nginx every socket says 127.0.0.1 — at
// which point, in its own words, it "falls back to a single shared per-path
// bucket". One bucket for everybody is worse than none: three attempts per ten
// seconds shared across the company means one script locks out every member of
// staff. The last test is the one that proves the fix.

import { test, expect } from "@playwright/test";

const CREDENTIALS = {
  email: `probe-${Date.now()}@example.invalid`,
  password: "Xk9#mQ2vLp8wZr4T",
  name: "probe",
};

test.describe("registration is closed", () => {
  test("a stranger cannot create an account", async ({ request, baseURL }) => {
    const res = await request.post("/api/auth/sign-up/email", {
      headers: { "content-type": "application/json", Origin: baseURL! },
      data: CREDENTIALS,
    });
    expect(res.status(), "sign-up answered something other than 403").toBe(403);
    expect((await res.json()).error).toMatch(/invitation/i);
  });

  test("a wrong token is no better than none", async ({ request, baseURL }) => {
    const res = await request.post("/api/auth/sign-up/email", {
      headers: {
        "content-type": "application/json",
        Origin: baseURL!,
        "x-internal-token": "not-the-token",
      },
      data: CREDENTIALS,
    });
    expect(res.status()).toBe(403);
  });

  test("no account was created by either attempt", async ({ request, baseURL }) => {
    // The real assertion. A 403 that still wrote a row would be worse than an
    // honest 200, because nobody would go looking.
    const res = await request.post("/api/auth/sign-in/email", {
      headers: { "content-type": "application/json", Origin: baseURL! },
      data: { email: CREDENTIALS.email, password: CREDENTIALS.password },
    });
    expect(res.status(), "the refused account can sign in — it was created").not.toBe(200);
  });
});

test.describe("sign-in throttling", () => {
  test("stops after five attempts from one address", async ({ request, baseURL }) => {
    const ip = `203.0.113.${10 + Math.floor(Math.random() * 200)}`;
    const attempt = () =>
      request.post("/api/auth/sign-in/email", {
        headers: { "content-type": "application/json", Origin: baseURL!, "x-real-ip": ip },
        data: { email: "nobody@example.invalid", password: "wrong-on-purpose" },
      });

    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await attempt()).status());

    expect(codes.slice(0, 5).every((c) => c !== 429), `early attempts were throttled: ${codes}`).toBe(true);
    expect(codes.some((c) => c === 429), `never throttled across 8 attempts: ${codes}`).toBe(true);
  });

  test("one blocked address does not block everyone else", async ({ request, baseURL }) => {
    /* THE POINT OF THE WHOLE EXERCISE. If this fails, the limiter is running on
       one shared bucket and a single script can lock the entire company out of
       the console — a denial of service handed over for free, wearing the
       costume of a security control. */
    const noisy = `203.0.113.${10 + Math.floor(Math.random() * 200)}`;
    const quiet = `198.51.100.${10 + Math.floor(Math.random() * 200)}`;

    for (let i = 0; i < 8; i++) {
      await request.post("/api/auth/sign-in/email", {
        headers: { "content-type": "application/json", Origin: baseURL!, "x-real-ip": noisy },
        data: { email: "nobody@example.invalid", password: "wrong-on-purpose" },
      });
    }

    const other = await request.post("/api/auth/sign-in/email", {
      headers: { "content-type": "application/json", Origin: baseURL!, "x-real-ip": quiet },
      data: { email: "nobody@example.invalid", password: "wrong-on-purpose" },
    });
    expect(other.status(), "a second address was throttled by the first one's attempts").not.toBe(429);
  });
});
