/**
 * Seed the SaaS layer: default features, two editions (plans), their feature bundles,
 * mark the host org, and put every tenant on a default edition. Idempotent.
 *   pnpm db:seed-saas
 */
import mysql from "mysql2/promise";
import { v7 as uuidv7 } from "uuid";

const url = process.env.DATABASE_URL ?? "mysql://root@localhost:3306/construction_intelligence";

const FEATURES: { key: string; name: string; price: number }[] = [
  { key: "boq", name: "BOQ", price: 50 },
  { key: "boq_ai", name: "BOQ AI", price: 120 },
  { key: "drawing", name: "Drawing (DrawLogix)", price: 80 },
  { key: "narrative", name: "Narrative", price: 40 },
  { key: "costlogix", name: "CostLogix", price: 60 },
  { key: "supplierlogix", name: "SupplierLogix", price: 60 },
  { key: "copilot", name: "AI Copilot", price: 90 },
];
const EDITIONS: { name: string; description: string; features: string[] }[] = [
  { name: "Edition 1 — Full", description: "BOQ + BOQ AI + Drawing + Narrative", features: ["boq", "boq_ai", "drawing", "narrative", "copilot"] },
  { name: "Edition 2 — Standard", description: "BOQ + Drawing (no AI/narrative)", features: ["boq", "drawing"] },
];
const HOST_ORG_NAME = "TechSME Test Org"; // admin@techsme.com's org = TechSME host
const DEFAULT_EDITION = "Edition 2 — Standard";

async function main() {
  const c = await mysql.createConnection({ uri: url });

  // Features
  for (const f of FEATURES) {
    await c.query("INSERT IGNORE INTO features(id,`key`,name,monthly_price) VALUES (?,?,?,?)", [uuidv7(), f.key, f.name, f.price]);
  }
  const [frows] = await c.query("SELECT id,`key` FROM features");
  const featureId = new Map((frows as { id: string; key: string }[]).map((r) => [r.key, r.id]));

  // Editions + mappings
  for (const e of EDITIONS) {
    const [ex] = await c.query("SELECT id FROM editions WHERE name=? LIMIT 1", [e.name]);
    const editionId = (ex as { id: string }[])[0]?.id ?? uuidv7();
    if (!(ex as { id: string }[])[0]) await c.query("INSERT INTO editions(id,name,description) VALUES (?,?,?)", [editionId, e.name, e.description]);
    for (const fk of e.features) {
      const fid = featureId.get(fk);
      if (fid) await c.query("INSERT IGNORE INTO edition_features(edition_id,feature_id) VALUES (?,?)", [editionId, fid]);
    }
  }

  // Host org
  const [host] = await c.query("UPDATE orgs SET is_host=1 WHERE name=?", [HOST_ORG_NAME]);
  console.log(`host '${HOST_ORG_NAME}': ${(host as { affectedRows: number }).affectedRows} org(s) flagged`);

  // Subscribe every non-host org with no active subscription to the default edition.
  const [defEd] = await c.query("SELECT id FROM editions WHERE name=? LIMIT 1", [DEFAULT_EDITION]);
  const defEditionId = (defEd as { id: string }[])[0]?.id;
  const [orgs] = await c.query("SELECT id,name FROM orgs WHERE is_host=0");
  let subbed = 0;
  for (const o of orgs as { id: string; name: string }[]) {
    const [has] = await c.query("SELECT id FROM org_subscriptions WHERE org_id=? AND status='active' LIMIT 1", [o.id]);
    if (!(has as unknown[]).length && defEditionId) {
      await c.query("INSERT INTO org_subscriptions(id,org_id,edition_id) VALUES (?,?,?)", [uuidv7(), o.id, defEditionId]);
      subbed++;
    }
  }
  await c.end();
  console.log(`features=${FEATURES.length} editions=${EDITIONS.length} · subscribed ${subbed} tenant(s) to '${DEFAULT_EDITION}'`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
