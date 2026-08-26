#!/usr/bin/env node
// Content-based secret scan over tracked files.
//
// ── WHY THIS REPLACES WHAT WAS HERE ──────────────────────────────────────────
//
// The previous hygiene gate rejected tracked files whose NAME matched
// `credentials*.md`. It passed cleanly while the repository contained:
//
//   src/app/login/page.tsx     a working password prefilled into the form,
//                              and printed under it in plain text
//   src/lib/provisioning.ts    `input.ownerPassword ?? "<literal>"` — every
//                              tenant provisioned without an explicit password
//                              silently got a published credential
//   scripts/seed-*.mjs         owner and ADMIN passwords as literals
//
// A filename check cannot see any of that. Worse, a substring search for the
// owner password did not find the admin one either — they were different
// strings. So this scans CONTENT, by shape rather than by known value.
//
// Values are never printed. A match reports file, line and the matched KEY, and
// redacts the secret itself, because CI logs are widely readable and printing a
// finding in full defeats the point of finding it.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const EXT = /\.(ts|tsx|js|mjs|cjs|jsx|yml|yaml|json|md|sql|sh|env|example)$/i;

const KEY = String.raw`(pass(?:word|wd)?|secret|token|api_?key|client_?secret|private_?key)`;

/** Assignments whose right-hand side looks like a literal credential. */
const RULES = [
  { id: "assigned-secret",
    /* password: "..."  |  token = '...'  |  "apiKey": "..."
       and also  const [password, setPassword] = useState("...")  — the shape the
       login page actually used. The key is not always adjacent to the operator,
       so allow a short run of non-quote characters (a destructure, a wrapping
       call) between them, still on one line. */
    /* The bridge allows a comma — `const [password, setPassword] = useState(...)`
       needs one — but never `}` or `;`. Excluding both was what stopped the
       match running past the end of one object literal into the next quoted
       value, e.g. `password: OWNER.password }, edition_ref: "enterprise"`
       reporting "enterprise" as a secret. */
    re: new RegExp(String.raw`\b${KEY}\b["'\`]?[^"'\`;{}\n]{0,24}?[:=][^"'\`;{}\n]{0,12}?["'\`]([^"'\`\n]{6,})["'\`]`, "gi"),
    keyAt: 1, valAt: 2 },
  { id: "assigned-secret-bare",
    /* YAML and .env carry unquoted values: DATABASE_PASSWORD: a-real-password.
       Restricted to those file types by `files` below. Applying it to TS/JS
       matched `maxTokens: null`, `password: z.string()` and `maxTokens = 12000`
       — 40-odd false positives in one pass, which is how a scanner gets
       switched off. In real TS/JS a literal is quoted, so the rule above
       already covers it. */
    files: /\.(ya?ml|env|example)$|(^|\/)\.env/i,
    re: new RegExp(String.raw`^\s*-?\s*["']?[A-Za-z0-9_.-]*${KEY}[A-Za-z0-9_.-]*["']?\s*[:=]\s*([^\s"'\`#\n][^\s"'\`#\n]{5,})\s*$`, "gim"),
    keyAt: 1, valAt: 2 },
  { id: "known-vendor-key",
    re: /\b(sk-ant-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g,
    keyAt: 0, valAt: 0 },
];

/* A value is not a secret merely because it sits next to the word "password".
   These shapes are how the codebase legitimately refers to secrets WITHOUT
   containing one. Kept deliberately narrow: each entry is a form that cannot
   carry a value, not a named exception for a value we tolerate. */
const NOT_A_VALUE = [
  /^process\.env\./,          // read from the environment
  /^required\(/,              // our fail-loudly helper
  /^\$\{/, /^\{\{/,           // interpolation
  /^<[^>]+>$/,                // <password> placeholder
  /^change-?me/i, /^(placeholder|example|redacted|xxx+|\*+|\.\.\.)$/i,
  /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/,   // an ENV VAR NAME, e.g. required("INTERNAL_SERVICE_TOKEN")
  /^(string|boolean|number|null|undefined|true|false)$/i,

  /* Shape rules. A hard-coded credential is one opaque token. These reject the
     things that merely sit near the word "password" — every one of them was an
     actual false positive on this repository:

       `Reset your password: ${url}`        prose in an email body           (spaces, ${)
       input[type="password"], input#pw     a CSS selector                   (spaces, [ )
       PASS / FAIL — ${bad} check(s)        console output                   (spaces)
       `preckon-${uuidv7().slice(0, 8)}`    a RANDOM per-tenant password     (${)
       authorization header Bearer parse    reading a token, not setting one ( ( )

     The last two matter most: iam.ts generates a unique password, which is the
     behaviour we want, and flagging it would train people to ignore the tool. */
  /\s/,                       // any whitespace: prose, selectors, output
  /[$`]/,                     // interpolation or a nested template
  /[()[\]{}]/,                // code, not a literal
  /^(Bearer|Basic|Digest)$/i,
  /^https?:\/\//,
  /^[\d.]+$/,                 // a number
];

/* Narrow, explicit allowlist for CI-only fixtures.
   Each entry must name the file AND the value, so adding one is a visible
   decision rather than a widening pattern. These exist only inside the
   ephemeral CI database and are not reachable from any deployed environment. */
const ALLOW = [
  { file: ".github/workflows/ci.yml", value: /^ci-/ },
  /* log.test.ts asserts that the logger REDACTS these. They have to be present
     for the test to mean anything, and they authenticate nothing. */
  { file: "test/log.test.ts", value: /.*/ },
  /* This scanner's own tests. Every fixture in there is a secret-shaped string
     that exists precisely so the scan can be proven to catch it — the file
     tripping the scan is the tests working, not a leak. Caught by the scan
     itself once the vendor-key rule was added, which is a fair demonstration. */
  { file: "test/scan-secrets.test.ts", value: /.*/ },
];

/* Applied ONLY to the code rule.
 *
 * In TS/JS a bare lowercase word next to "password" is nearly always an
 * identifier — `headers.get("authorization")` was the false positive that
 * prompted this. In a .env or YAML file it is the opposite: the value after
 * DATABASE_PASSWORD= *is* the password, however plain it looks.
 *
 * Applying it everywhere silently suppressed `DATABASE_PASSWORD=preckon` in
 * .env.example and the scan reported "clean" — a weak shipped default hidden by
 * the tool meant to find it. That is the exact failure this scanner replaced, so
 * the rule is scoped rather than global.
 */
const CODE_ONLY_NOT_A_VALUE = [
  /^[a-z]+$/,
];

const allowed = (file, value) =>
  ALLOW.some((a) => file.endsWith(a.file) && a.value.test(value));

const redact = (v) =>
  v.length <= 4 ? "*".repeat(v.length) : `${v.slice(0, 2)}${"*".repeat(Math.min(v.length - 2, 12))}`;

function tracked() {
  return execSync("git ls-files", { encoding: "utf8" })
    .split("\n").filter((f) => f && EXT.test(f));
}

export function scanText(text, file = "<memory>") {
  const findings = [];
  const lines = text.split("\n");
  for (const rule of RULES) {
    if (rule.files && !rule.files.test(file)) continue;
    for (const [i, line] of lines.entries()) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line))) {
        const value = (m[rule.valAt] ?? "").trim();
        if (!value) continue;
        if (NOT_A_VALUE.some((p) => p.test(value))) continue;
        if (rule.id === "assigned-secret" && CODE_ONLY_NOT_A_VALUE.some((p) => p.test(value))) continue;
        if (allowed(file, value)) continue;
        findings.push({ file, line: i + 1, rule: rule.id, key: m[rule.keyAt], redacted: redact(value) });
      }
    }
  }
  return findings;
}

// Skip self: this file necessarily contains the patterns it looks for.
const SELF = "scripts/scan-secrets.mjs";

function main() {
  const findings = [];
  for (const f of tracked()) {
    if (f.endsWith(SELF)) continue;
    let text;
    try { text = readFileSync(f, "utf8"); } catch { continue; }
    findings.push(...scanText(text, f));
  }
  if (!findings.length) {
    console.log("secret scan: clean");
    return 0;
  }
  console.error(`\nsecret scan: ${findings.length} finding(s). Values are redacted deliberately.\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.key} = ${f.redacted}   [${f.rule}]`);
  }
  console.error(
    "\nRead the value from the environment and fail when it is absent, rather than\n" +
    "defaulting to a literal. If this is genuinely a CI-only fixture, add it to the\n" +
    "narrow ALLOW list in this script with both its file and its value.\n",
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("scan-secrets.mjs")) {
  process.exit(main());
}
