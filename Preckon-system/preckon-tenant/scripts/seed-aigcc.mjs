// Seed a rich CONSTRUCTION demo tenant — "AIGCC Group" — into the running tenant
// plane: owner + team, a real rate book / standards / precedent library, a
// portfolio of live tenders, and autopilot-run pursuits so the workspace looks
// alive. Idempotent-ish: re-running skips users/library/projects that exist.
//
//   node scripts/seed-aigcc.mjs            (against http://localhost:3100)
//
/* Secrets come from the environment, and their absence is a hard stop.
 *
 * These used to default to a published literal, so running the script with no
 * environment at all quietly provisioned a known password. A seed that invents
 * a credential is indistinguishable from one that was configured properly,
 * which is the whole problem. */
function required(name, hint) {
  const v = process.env[name];
  if (!v) {
    console.error(`\n${name} is not set.\n${hint}\n`);
    process.exit(2);
  }
  return v;
}

const BASE = process.env.TENANT_URL ?? "http://localhost:3100";
const TOKEN = required("INTERNAL_SERVICE_TOKEN",
  "It must match the value the tenant app runs with. A silent fallback here would\nauthenticate against nothing and fail later as a confusing 401.");
const TENANT = "00000000-0000-7000-8000-0000000000a1";
const OWNER = {
  email: process.env.SEED_OWNER_EMAIL ?? "owner@aigcc.group",   // a label, not a secret
  name: "Ade Bello",
  password: required("SEED_OWNER_PASSWORD",
    "Choose the demo owner password for this environment, e.g.\n  SEED_OWNER_PASSWORD=... node scripts/seed-aigcc.mjs"),
};

let cookie = "";
async function call(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", origin: BASE, cookie, ...(opts.headers || {}) } });
  const setc = res.headers.getSetCookie?.() ?? [];
  if (setc.length) cookie = setc.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (r) => r.status >= 200 && r.status < 300;

// ── Demo content (construction / AIGCC Group) ──────────────────────────────
const ADMIN_PASSWORD = required("SEED_ADMIN_PASSWORD",
  "Password for the seeded demo ADMIN accounts. These are privileged, so there is deliberately no default.");

const USERS = [
  { email: "priya.nair@aigcc.group",  name: "Priya Nair",   roleKeys: ["precon_lead"] },
  { email: "marco.reyes@aigcc.group", name: "Marco Reyes",  roleKeys: ["estimator"] },
  { email: "sarah.chen@aigcc.group",  name: "Sarah Chen",   roleKeys: ["qs_reviewer"] },
  { email: "james.okafor@aigcc.group",name: "James Okafor", roleKeys: ["admin"] },
  { email: "lena.novak@aigcc.group",  name: "Lena Novak",   roleKeys: ["viewer"] },
  // Demo admins. The password comes from SEED_ADMIN_PASSWORD; it used to be a
  // second hard-coded literal here, on ADMIN accounts, and a substring search
  // for the owner password never found it.
  { email: "shruthi@aigcc.group",     name: "Shruthi",      roleKeys: ["admin"], password: ADMIN_PASSWORD },
  { email: "pranavi@aigcc.group",     name: "Pranavi",      roleKeys: ["admin"], password: ADMIN_PASSWORD },
];

const RATE_BOOK = [
  { code: "C25", payload: { description: "Concrete grade C25/30 to foundations", unit: "m3", rate_minor: 15200, currency: "USD", trade: "Concrete" } },
  { code: "C32", payload: { description: "Concrete grade C32/40 to superstructure", unit: "m3", rate_minor: 16850, currency: "USD", trade: "Concrete" } },
  { code: "R16", payload: { description: "Reinforcement bar 16mm high-yield", unit: "kg", rate_minor: 125, currency: "USD", trade: "Rebar" } },
  { code: "R25", payload: { description: "Reinforcement bar 25mm high-yield", unit: "kg", rate_minor: 132, currency: "USD", trade: "Rebar" } },
  { code: "FW1", payload: { description: "Formwork to soffits & beams", unit: "m2", rate_minor: 4200, currency: "USD", trade: "Formwork" } },
  { code: "BW1", payload: { description: "Blockwork 140mm external walls", unit: "m2", rate_minor: 6800, currency: "USD", trade: "Masonry" } },
  { code: "SS1", payload: { description: "Structural steel UB/UC sections, erected", unit: "tonne", rate_minor: 245000, currency: "USD", trade: "Steel" } },
  { code: "CW1", payload: { description: "Unitised curtain walling, glazed", unit: "m2", rate_minor: 62000, currency: "USD", trade: "Facade" } },
  { code: "PIL", payload: { description: "Bored cast-in-place piles 600mm", unit: "m", rate_minor: 21000, currency: "USD", trade: "Piling" } },
  { code: "EXC", payload: { description: "Bulk excavation incl. cart away", unit: "m3", rate_minor: 1850, currency: "USD", trade: "Groundworks" } },
  { code: "WP1", payload: { description: "Tanking / waterproofing membrane", unit: "m2", rate_minor: 5500, currency: "USD", trade: "Waterproofing" } },
  { code: "MEP", payload: { description: "MEP first + second fix per m2 GFA", unit: "m2", rate_minor: 34000, currency: "USD", trade: "MEP" } },
];
const STANDARDS = [
  { key: "EN1992", payload: { title: "Eurocode 2 — Design of concrete structures", discipline: "structural", mandatory: true } },
  { key: "EN1090", payload: { title: "Execution of steel structures (EN 1090-2)", discipline: "structural", mandatory: true } },
  { key: "ISO19650", payload: { title: "BIM information management (ISO 19650)", discipline: "digital", mandatory: false } },
  { key: "OHS45001", payload: { title: "Occupational health & safety (ISO 45001)", discipline: "hse", mandatory: true } },
];
const PRECEDENT = [
  { key: "harbour-point", payload: { project: "Harbour Point Tower", value_minor: 4820000000, currency: "USD", outcome: "won", margin_pct: 11.5, year: 2024 } },
  { key: "terminal-3", payload: { project: "Airport Terminal 3 Fit-out", value_minor: 1265000000, currency: "USD", outcome: "lost", margin_pct: 8.0, year: 2025 } },
];
const PROJECTS = [
  { name: "Marina Bay Mixed-Use Tower", code: "MBT-2026", client_name: "Harbourfront Development Authority", run: true },
  { name: "Coastal Highway Bridge — Segment 4", code: "CHB-004", client_name: "National Roads Agency", run: true },
  { name: "Green Data Centre — Phase 1", code: "GDC-001", client_name: "Nimbus Cloud Infrastructure", run: false },
  { name: "Metro Line 4 — Central Station", code: "ML4-CS", client_name: "Metropolitan Transit Board", run: false },
  { name: "Riverside Hospital — East Wing", code: "RHW-2026", client_name: "Regional Health Trust", run: false },
];

// Returns { ok, detail }. Never reports "timeout" for a pursuit that actually
// finished — that misdiagnosis cost real debugging time, so it is worth explaining.
//
// continuePursuit() treats a workflow as attempted once it has ANY terminal run:
// completed, failed OR cancelled. That is deliberate — it stops autopilot from
// retrying a deterministically-failing workflow forever. When the last workflow
// reaches a terminal state, autopilot clears its own flag and stops.
//
// The old exit condition was `!autopilot && completed >= total`, and `completed`
// counts ONLY status === "completed". So one failed workflow left autopilot
// finished (flag clear) but the count permanently short. This loop then polled
// all 160 times and printed "timeout" — for a pursuit that had ended minutes
// earlier with a failure it never named.
//
// So: a cleared autopilot flag means the pursuit is OVER. Report what actually
// happened to each workflow.
async function drivePursuit(pid) {
  const started = await call(`/api/v1/projects/${pid}/pursuit/start`, { method: "POST", body: "{}" });
  if (!ok(started)) return { ok: false, detail: `could not start: HTTP ${started.status} ${JSON.stringify(started.body)}` };

  // A status body is only trustworthy if it has the shape pursuitStatus()
  // returns. Without this check an ERROR body passes straight through: it has no
  // `autopilot` field, so `!s.autopilot` is true and the loop breaks; `s.plan`
  // is undefined, so nothing looks wrong; and the pursuit is reported as a
  // SUCCESS that never ran. Silent false success is worse than the timeout this
  // function replaced, so the shape is checked rather than assumed.
  const valid = (b) =>
    b && typeof b === "object" && typeof b.autopilot === "boolean" &&
    Number.isFinite(b.total) && Array.isArray(b.plan);

  const DEADLINE_MS = 320_000;
  const began = Date.now();
  let s = null;
  let lastBad = null;   // most recent unusable body, for the error message

  while (Date.now() - began < DEADLINE_MS) {
    const res = await call(`/api/v1/projects/${pid}/pursuit`);
    if (!valid(res.body)) { lastBad = res; await sleep(2000); continue; }
    s = res.body;
    if (!s.autopilot) break;               // autopilot is done, however it ended
    await sleep(2000);
  }

  if (!s) {
    const why = lastBad
      ? `last response HTTP ${lastBad.status}: ${JSON.stringify(lastBad.body).slice(0, 300)}`
      : "no response at all";
    return { ok: false, detail: `never returned a usable pursuit status — ${why}` };
  }

  const bad = s.plan.filter((w) => w.status !== "completed");
  const names = () => bad.map((w) => `${w.key}=${w.status}`).join(", ") || "none reported";

  // Still flagged on after the deadline: genuinely stuck, not merely failed. The
  // usual cause is a run parked in awaiting_review — continuePursuit() will not
  // start the next workflow while one is running or awaiting, so a review gate
  // holds autopilot open indefinitely.
  if (s.autopilot) {
    return { ok: false, detail: `STUCK after ${Math.round((Date.now() - began) / 1000)}s, autopilot still on — ${names()}` };
  }

  if (bad.length === 0) return { ok: true, detail: `${s.completed}/${s.total} · ${s.lifecycleState}` };
  return { ok: false, detail: `autopilot ENDED with ${bad.length}/${s.total} not completed — ${names()}` };
}

(async () => {
  console.log(`\nSeeding AIGCC Group (construction) into ${BASE}\n${"=".repeat(58)}`);

  // 1) Bootstrap the tenant (service auth, idempotent by tenant id).
  const boot = await call(`/api/internal/tenants/${TENANT}/bootstrap`, {
    method: "POST", headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ tenant_name: "AIGCC Group", owner: { email: OWNER.email, name: OWNER.name, password: OWNER.password }, edition_ref: "enterprise", domain_key: "construction", max_tier: "deep" }),
  });
  console.log(`tenant bootstrap → HTTP ${boot.status}`);

  // 2) Sign in as the owner.
  const login = await call("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email: OWNER.email, password: OWNER.password }) });
  if (login.status !== 200) throw new Error("owner login failed: " + JSON.stringify(login.body));

  // 3) Team.
  let addedUsers = 0;
  for (const u of USERS) {
    const r = await call("/api/v1/users", { method: "POST", body: JSON.stringify(u) });
    if (ok(r)) addedUsers++;
  }
  console.log(`team members ensured (${addedUsers} added, ${USERS.length - addedUsers} already present)`);

  // 4) Library: rate book, standards, precedent.
  const existingLib = new Set(((await call("/api/v1/library")).body ?? []).map((e) => `${e.collection}:${e.entry_key}`));
  let libAdded = 0;
  const addLib = async (collection, entryKey, payload) => {
    if (existingLib.has(`${collection}:${entryKey}`)) return;
    if (ok(await call("/api/v1/library", { method: "POST", body: JSON.stringify({ collection, entryKey, payload }) }))) libAdded++;
  };
  for (const r of RATE_BOOK) await addLib("rate_book", r.code, r.payload);
  for (const s of STANDARDS) await addLib("standard", s.key, s.payload);
  for (const p of PRECEDENT) await addLib("precedent", p.key, p.payload);
  console.log(`library entries added: ${libAdded} (rate book ${RATE_BOOK.length}, standards ${STANDARDS.length}, precedent ${PRECEDENT.length})`);

  // 5) Project portfolio.
  const existingProjects = new Map(((await call("/api/v1/projects")).body ?? []).map((p) => [p.code, p.id]));
  const created = [];
  for (const p of PROJECTS) {
    let id = existingProjects.get(p.code);
    if (!id) {
      const r = await call("/api/v1/projects", { method: "POST", body: JSON.stringify({ name: p.name, code: p.code, client_name: p.client_name, lifecycle_key: "bid_pursuit" }) });
      id = r.body?.id;
    }
    created.push({ ...p, id });
  }
  console.log(`projects ensured: ${created.filter((p) => p.id).length}/${PROJECTS.length}`);

  // 6) Run autopilot on the flagged pursuits so artifacts/lifecycle populate.
  const failures = [];
  for (const p of created.filter((p) => p.run && p.id)) {
    process.stdout.write(`  ▶ autopilot: ${p.name.padEnd(34)} `);
    const r = await drivePursuit(p.id);
    console.log(r.ok ? r.detail : `FAILED — ${r.detail}`);
    if (!r.ok) failures.push(`${p.name}: ${r.detail}`);
  }

  if (failures.length) {
    console.error(`\n${failures.length} pursuit(s) did not complete:`);
    for (const f of failures) console.error(`   - ${f}`);
    console.error("\nThe workspace is only partly seeded. The E2E specs walk a project with");
    console.error("data at every chain stage, so they would fail downstream on missing data");
    console.error("rather than here. Failing now instead.\n");
    process.exit(1);
  }

  const verify = (await call("/api/v1/audit/verify")).body;
  console.log(`${"=".repeat(58)}\nAudit chain: ${JSON.stringify(verify)}`);
  console.log(`\n✅ AIGCC Group ready — sign in as ${OWNER.email} with SEED_OWNER_PASSWORD\n`);
})().catch((e) => { console.error("FATAL", e); process.exit(2); });
