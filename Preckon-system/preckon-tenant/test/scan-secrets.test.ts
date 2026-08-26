// The secret scanner has to catch what the old filename-only gate missed.
//
// That gate rejected tracked files named `credentials*.md` and passed cleanly
// while a working password sat prefilled in the login form, printed under it in
// plain text, and defaulted inside provisioning.ts for every tenant bootstrapped
// without one. A scanner that cannot fail is worth nothing, so these cases pin
// the four properties issue #4 asks for.

import { describe, it, expect } from "vitest";
// @ts-expect-error - plain .mjs helper, no types
import { scanText } from "../scripts/scan-secrets.mjs";

const q = String.fromCharCode(34);

describe("content-based secret detection", () => {
  it("detects a password literal in TSX", () => {
    const src = `const [password, setPassword] = useState(${q}hunter2-not-a-real-one${q});`;
    const found = scanText(src, "src/app/login/page.tsx");
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("assigned-secret");
  });

  it("detects a service-token fallback in MJS", () => {
    const src = `const TOKEN = process.env.X ?? ${q}change-me-service-token-value${q};\n` +
                `const t = { token: ${q}a-real-looking-token-value${q} };`;
    const found = scanText(src, "scripts/seed.mjs");
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it("detects a secret in YAML", () => {
    const found = scanText("  DATABASE_PASSWORD: some-real-password-here\n", ".github/workflows/other.yml");
    expect(found).toHaveLength(1);
  });

  it("catches the ADMIN password a substring search for the OWNER password missed", () => {
    /* The real miss. Two different literals lived in one file; grepping for the
       first never revealed the second, and the second was on admin accounts. */
    const src =
      `{ email: ${q}a@x.com${q}, roleKeys: [${q}admin${q}], password: ${q}preckon-2026${q} },\n` +
      `{ email: ${q}b@x.com${q}, roleKeys: [${q}admin${q}], password: ${q}preckon-2026${q} },`;
    expect(scanText(src, "scripts/seed-aigcc.mjs")).toHaveLength(2);
  });

  it("permits a narrowly allowlisted CI-only fixture", () => {
    const src = "  DATABASE_PASSWORD: ci-only-db-password-24chars\n";
    expect(scanText(src, ".github/workflows/ci.yml")).toEqual([]);
  });

  it("does not allowlist that value in another workflow", () => {
    // The allowlist is keyed on file AND value, so the same string in a
    // different workflow is still a finding rather than a blanket exception.
    const src = "  DATABASE_PASSWORD: ci-only-db-password-24chars\n";
    expect(scanText(src, ".github/workflows/nightly.yml")).toHaveLength(1);
  });

  it("still reports a plain lowercase value in .env, where it IS the password", () => {
    /* The regression that matters. A rule added to silence
       `headers.get("authorization")` in TS also suppressed
       `DATABASE_PASSWORD=preckon` in .env.example, and the scan went green over
       a weak shipped default — the tool hiding the thing it exists to find.
       The rule is now code-only, and this pins that. */
    expect(scanText("DATABASE_PASSWORD=preckon\n", ".env.example")).toHaveLength(1);
    expect(scanText(`const h = ${q}authorization${q};`, "src/lib/context.ts")).toEqual([]);
  });

  it("redacts the value, because CI logs are readable", () => {
    const secret = "super-secret-value-here";
    const found = scanText(`password: ${q}${secret}${q}`, "x.ts");
    expect(found).toHaveLength(1);
    expect(found[0].redacted).not.toContain(secret);
    expect(JSON.stringify(found)).not.toContain(secret);
  });

  it("ignores environment reads and placeholders, or nobody would keep it on", () => {
    for (const line of [
      "const p = process.env.OWNER_PASSWORD;",
      `const t = required(${q}INTERNAL_SERVICE_TOKEN${q}, ${q}hint${q});`,
      "password: <password>",
      "password: changeme",
      `password: ${q}\${OWNER_PASSWORD}${q}`,
    ]) {
      expect(scanText(line, "x.ts"), line).toEqual([]);
    }
  });

  it("detects a vendor key by shape even with no assignment", () => {
    const found = scanText("curl -H 'x-api-key: sk-ant-abcdef0123456789xyz'", "docs/run.md");
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("known-vendor-key");
  });
});
