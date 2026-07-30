/**
 * Host Console setup — REAL DATA ONLY. Idempotent.  →  pnpm db:seed-host
 *
 * This does NOT fabricate tenants, invoices, notifications, usage or revenue. It:
 *   1. REMOVES any earlier demo/seed data (the fake tenants + invented catalog).
 *   2. Restores the real feature names.
 *   3. Seeds ONLY genuine reference/config the host console needs to operate:
 *      currencies (ISO reference), platform settings (real defaults), AI providers
 *      (the routing the AI tier actually uses — as secret-manager references, never
 *      keys). No business activity is invented.
 *   4. Enriches the real features with catalog metadata (module/flag).
 *   5. Grants the host org's owner/admin roles the HOST permission catalog.
 *
 * Everything the console then shows (tenants, subscriptions, editions, features,
 * pricing, audit, projects) comes straight from the live tables.
 */
import mysql from "mysql2/promise";
import { v7 as uuidv7 } from "uuid";

const url = process.env.DATABASE_URL ?? "mysql://root@localhost:3306/construction_intelligence";
const c = await mysql.createConnection({ uri: url });
const q = async (sql: string, params: unknown[] = []) => (await c.query(sql, params))[0] as never;
const rows = async <T>(sql: string, params: unknown[] = []) => (await c.query(sql, params))[0] as T[];

const HOST_PERMISSION_KEYS = [
  "tenant.read", "tenant.create", "tenant.update", "tenant.suspend", "tenant.restore", "tenant.impersonate", "tenant.offboard", "tenant.theme.write", "entitlement.override",
  "edition.read", "edition.write", "feature.read", "feature.write",
  "pricing.read", "pricing.write", "coupon.write",
  "billing.read", "subscription.manage", "invoice.retry", "invoice.remind", "billing.refund",
  "notification.read", "notification.send",
  "host_user.read", "host_user.manage", "role.manage",
  "audit.read", "audit.export", "settings.read", "settings.write", "settings.ai.write", "maintenance.toggle", "observability.read", "job.manage",
];

// ── 1. Remove any prior demo/seed data ────────────────────────────────────────
const DEMO_SLUGS = ["vantage-infra", "northform", "meridian-qs", "harbour-civil", "atlas-interiors", "cedar-stone", "redline-mech", "summit-epc"];
const INVENTED_EDITIONS = ["starter", "professional", "enterprise"];
const INVENTED_FEATURES = ["capability.white_label", "capability.sso", "capability.api_access", "limit.seats", "limit.projects", "limit.storage_gb", "limit.audit_export", "metric.drawings", "metric.boqs", "metric.estimates", "metric.procurement_packages"];

// Fabricated activity tables — wipe entirely (every row in them was seed-only).
for (const t of ["invoice_line", "invoice", "notification", "host_notification_read", "host_notification", "job_failure", "coupon", "edition_price", "usage_rate", "tenant_entitlement_override", "impersonation_session"]) {
  await q(`DELETE FROM ${t}`);
}
// Demo tenant orgs (org_subscriptions cascade via FK).
for (const slug of DEMO_SLUGS) await q("DELETE FROM orgs WHERE slug=? AND is_host=0", [slug]);
// Invented catalog rows.
const invEds = await rows<{ id: string }>(`SELECT id FROM editions WHERE \`key\` IN (${INVENTED_EDITIONS.map(() => "?").join(",")})`, INVENTED_EDITIONS);
for (const e of invEds) { await q("DELETE FROM edition_features WHERE edition_id=?", [e.id]); await q("DELETE FROM org_subscriptions WHERE edition_id=?", [e.id]); await q("DELETE FROM editions WHERE id=?", [e.id]); }
const invFeats = await rows<{ id: string }>(`SELECT id FROM features WHERE \`key\` IN (${INVENTED_FEATURES.map(() => "?").join(",")})`, INVENTED_FEATURES);
for (const f of invFeats) { await q("DELETE FROM edition_features WHERE feature_id=?", [f.id]); await q("DELETE FROM features WHERE id=?", [f.id]); }

// ── 2. Restore real feature names + enrich with catalog metadata ──────────────
const REAL_FEATURES: [string, string, string][] = [
  ["boq", "BOQ", "module"],
  ["boq_ai", "BOQ AI", "module"],
  ["drawing", "Drawing (DrawLogix)", "module"],
  ["narrative", "Narrative", "module"],
  ["costlogix", "CostLogix", "module"],
  ["supplierlogix", "SupplierLogix", "module"],
  ["copilot", "AI Copilot", "capability"],
];
for (const [key, name, category] of REAL_FEATURES) {
  await q("UPDATE features SET name=?, category=?, type='flag', value_type='boolean', status='active' WHERE `key`=?", [name, category, key]);
}

// ── 3. Reference/config the console genuinely needs ───────────────────────────
const CURRENCIES: [string, string, string, number][] = [
  ["USD", "US Dollar", "$", 0], ["CAD", "Canadian Dollar", "$", 1], ["EUR", "Euro", "€", 2], ["GBP", "British Pound", "£", 3], ["AED", "UAE Dirham", "د.إ", 4],
];
for (const [code, name, symbol, sort] of CURRENCIES) {
  await q("INSERT INTO currency(code,name,symbol,minor_unit,sort_order) VALUES(?,?,?,2,?) ON DUPLICATE KEY UPDATE name=VALUES(name),symbol=VALUES(symbol),sort_order=VALUES(sort_order)", [code, name, symbol, sort]);
}

const SETTINGS: [string, unknown, string][] = [
  ["general.platform_name", "Preckon", "Product/branding name"],
  ["general.support_email", "support@techsme.com", "Support inbox"],
  ["general.default_tenant_theme", "system", "Default theme for new tenants"],
  ["security.session_max_hours", 8, "Host session length"],
  ["security.require_2fa", false, "Require 2FA for host staff"],
  ["security.enforce_sso_enterprise", false, "Force SSO for enterprise tenants"],
  ["security.password_policy", "standard", "Staff password policy"],
  ["maintenance.enabled", false, "Maintenance mode"],
  ["maintenance.message", "", "Maintenance banner text"],
  ["impersonation.max_minutes", 30, "Impersonation time-box"],
  ["offboarding.retention_days", 30, "Offboarding retention window"],
  ["entitlements.cache_ttl_seconds", 300, "Entitlement cache backstop"],
  ["email.provider", "resend", "Transactional email provider"],
  ["email.from_address", "noreply@techsme.com", "From address"],
  ["email.api_key_secret_ref", "secret://email/api_key", "Provider key reference"],
];
for (const [k, v, d] of SETTINGS) {
  await q("INSERT INTO platform_setting(`key`,value,description) VALUES(?,?,?) ON DUPLICATE KEY UPDATE description=VALUES(description)", [k, JSON.stringify(v), d]);
}

// AI providers = the routing the AI tier really uses (env AI keys), stored as
// secret-manager references — never the key itself.
const PROVIDERS: [string, string, string, string, string][] = [
  ["anthropic", "Anthropic", "llm", "primary", "secret://ai/anthropic"],
  ["voyage", "Voyage AI", "embedding", "embeddings", "secret://ai/voyage"],
];
for (const [key, name, kind, role, ref] of PROVIDERS) {
  await q("INSERT INTO ai_provider(id,`key`,name,kind,role,api_key_secret_ref,status) VALUES(?,?,?,?,?,?,'active') ON DUPLICATE KEY UPDATE name=VALUES(name),role=VALUES(role),kind=VALUES(kind)", [uuidv7(), key, name, kind, role, ref]);
}

// ── 4. Grant host RBAC (host org owner/admin get the full HOST catalog) ────────
const hostOrg = (await rows<{ id: string }>("SELECT id FROM orgs WHERE is_host=1 LIMIT 1"))[0];
if (hostOrg) {
  const hostRoles = await rows<{ id: string; name: string; permissions: string }>("SELECT id,name,permissions FROM roles WHERE org_id=?", [hostOrg.id]);
  let granted = 0;
  for (const r of hostRoles) {
    if (r.name === "owner" || r.name === "admin") {
      let base: string[] = [];
      try { base = JSON.parse(r.permissions ?? "[]"); } catch { base = []; }
      await q("UPDATE roles SET permissions=? WHERE id=?", [JSON.stringify([...new Set([...base, ...HOST_PERMISSION_KEYS])]), r.id]);
      granted++;
    }
  }
  if (!hostRoles.some((r) => r.name === "owner")) {
    await q("INSERT INTO roles(id,org_id,name,is_system,permissions) VALUES(?,?,?,'true',?)", [uuidv7(), hostOrg.id, "owner", JSON.stringify(HOST_PERMISSION_KEYS)]);
  }
  console.log(`host RBAC: granted host catalog to ${granted} role(s)`);
} else {
  console.warn("⚠ no host org (orgs.is_host=1) found — run pnpm db:seed-saas first");
}

const tenantN = (await rows<{ n: number }>("SELECT COUNT(*) n FROM orgs WHERE is_host=0"))[0]?.n ?? 0;
await c.end();
console.log(`✓ host config seeded (real data only) · demo data removed · ${tenantN} real tenants · ${CURRENCIES.length} currencies · ${PROVIDERS.length} AI providers`);
