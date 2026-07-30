// Expand-contract guard (ws 0.7.3, guardrail #5). Scans migrations/*.sql for
// destructive operations that would break running code. A genuinely-needed
// destructive CONTRACT step must be a separate, later migration explicitly tagged
// `-- @contract` on the line, proving it was a deliberate two-phase change.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const DESTRUCTIVE = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bALTER\s+COLUMN\b.+\bSET\s+NOT\s+NULL\b/i, // Postgres
  /\bALTER\s+COLUMN\b.+\bTYPE\b/i, // Postgres
  /\bMODIFY\b.+\bNOT\s+NULL\b/i, // MySQL/MariaDB in-place tighten
  /\bCHANGE\s+COLUMN\b/i, // MySQL/MariaDB rename+retype
  /\bRENAME\s+(TABLE|COLUMN)\b/i,
  /\bTRUNCATE\b/i,
];

let violations = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
  const lines = readFileSync(join(dir, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes("@contract")) return; // explicitly-tagged deliberate contract step
    if (DESTRUCTIVE.some((re) => re.test(line))) {
      console.error(`✗ ${file}:${i + 1} destructive op (expand-contract violation): ${line.trim()}`);
      violations++;
    }
  });
}

if (violations) {
  console.error(`\n${violations} destructive migration op(s) found. Use expand-contract (guardrail #5).`);
  process.exit(1);
}
console.log("✓ migrations are expand-contract clean.");
