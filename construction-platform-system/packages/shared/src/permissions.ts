/**
 * The canonical permission catalog — the SINGLE SOURCE (ws 0.3, guardrail #3).
 * Permissions are referenced by constant, NEVER an ad-hoc string literal, and are
 * always checked server-side (see apps/web/src/server/authz.ts). The catalog grows
 * WITHIN the system as modules land — it is never extended with one-off strings.
 */
export const PERMISSIONS = {
  PROJECT_CREATE: "project:create",
  DOCUMENT_UPLOAD: "document:upload",
  BOQ_APPROVE: "boq:approve",
  ESTIMATE_PUBLISH: "estimate:publish",
  ROLE_MANAGE: "role:manage",
  AUDIT_READ: "audit:read",
  THRESHOLD_MANAGE: "threshold:manage",
  BRANDING_MANAGE: "branding:manage",
  ADMIN_MANAGE_USERS: "admin:manage_users",
  // ── TenderLogix module (Phase 1) ──
  TENDER_PROJECT_MANAGE: "tender:project_manage", // create/edit/archive tender projects
  TENDER_DOCUMENT_UPLOAD: "tender:document_upload", // upload CAD drawings / tender docs
  TENDER_BOQ_GENERATE: "tender:boq_generate", // run the AI multi-agent BOQ pipeline
  TENDER_BOQ_APPROVE: "tender:boq_approve", // QS sign-off: advance a BOQ line through the lifecycle
  TENDER_BOQ_EXPORT: "tender:boq_export", // export the priced BOQ / programme / narrative
  // ── DrawLogix module ──
  DRAWLOGIX_PROJECT_MANAGE: "drawlogix:project_manage", // create/edit drawing projects
  DRAWLOGIX_DOCUMENT_UPLOAD: "drawlogix:document_upload", // add SOW / interview / spec docs
  DRAWLOGIX_GENERATE: "drawlogix:generate", // run the AI concept generation
  DRAWLOGIX_APPROVE: "drawlogix:approve", // engineer sign-off on a generated drawing
} as const;

/**
 * HOST control-plane permission catalog (Preckon Host backend design §1.3). These
 * gate the hardened `/host` area — checked server-side against the resolved set on a
 * member of the host org (orgs.is_host). Keys mirror the spec verbatim so the console
 * and the spec stay 1:1.
 */
export const HOST_PERMISSIONS = {
  // Tenants
  TENANT_READ: "tenant.read",
  TENANT_CREATE: "tenant.create",
  TENANT_UPDATE: "tenant.update",
  TENANT_SUSPEND: "tenant.suspend",
  TENANT_RESTORE: "tenant.restore",
  TENANT_IMPERSONATE: "tenant.impersonate",
  TENANT_OFFBOARD: "tenant.offboard",
  TENANT_THEME_WRITE: "tenant.theme.write",
  ENTITLEMENT_OVERRIDE: "entitlement.override",
  // Product
  EDITION_READ: "edition.read",
  EDITION_WRITE: "edition.write",
  FEATURE_READ: "feature.read",
  FEATURE_WRITE: "feature.write",
  // Pricing
  PRICING_READ: "pricing.read",
  PRICING_WRITE: "pricing.write",
  COUPON_WRITE: "coupon.write",
  // Billing
  BILLING_READ: "billing.read",
  SUBSCRIPTION_MANAGE: "subscription.manage",
  INVOICE_RETRY: "invoice.retry",
  INVOICE_REMIND: "invoice.remind",
  BILLING_REFUND: "billing.refund",
  // Notifications
  NOTIFICATION_READ: "notification.read",
  NOTIFICATION_SEND: "notification.send",
  // Administration
  HOST_USER_READ: "host_user.read",
  HOST_USER_MANAGE: "host_user.manage",
  HOST_ROLE_MANAGE: "role.manage",
  // Operations
  AUDIT_READ_HOST: "audit.read",
  AUDIT_EXPORT: "audit.export",
  SETTINGS_READ: "settings.read",
  SETTINGS_WRITE: "settings.write",
  SETTINGS_AI_WRITE: "settings.ai.write",
  MAINTENANCE_TOGGLE: "maintenance.toggle",
  OBSERVABILITY_READ: "observability.read",
  JOB_MANAGE: "job.manage",
} as const;

export type HostPermission = (typeof HOST_PERMISSIONS)[keyof typeof HOST_PERMISSIONS];

/** Host permission catalog grouped by category — drives the RBAC matrix UI (§1.3). */
export const HOST_PERMISSION_CATALOG: { category: string; keys: HostPermission[] }[] = [
  { category: "Tenants", keys: ["tenant.read", "tenant.create", "tenant.update", "tenant.suspend", "tenant.restore", "tenant.impersonate", "tenant.offboard", "tenant.theme.write", "entitlement.override"] },
  { category: "Product", keys: ["edition.read", "edition.write", "feature.read", "feature.write"] },
  { category: "Pricing", keys: ["pricing.read", "pricing.write", "coupon.write"] },
  { category: "Billing", keys: ["billing.read", "subscription.manage", "invoice.retry", "invoice.remind", "billing.refund"] },
  { category: "Notifications", keys: ["notification.read", "notification.send"] },
  { category: "Administration", keys: ["host_user.read", "host_user.manage", "role.manage"] },
  { category: "Operations", keys: ["audit.read", "audit.export", "settings.read", "settings.write", "settings.ai.write", "maintenance.toggle", "observability.read", "job.manage"] },
];

/** Suggested system host roles (§1.3) — key → the permission keys they grant. */
export const HOST_ROLE_PRESETS: Record<string, HostPermission[]> = {
  owner: Object.values(HOST_PERMISSIONS),
  admin: Object.values(HOST_PERMISSIONS).filter((k) => !["role.manage", "billing.refund", "maintenance.toggle"].includes(k)),
  billing: ["billing.read", "subscription.manage", "invoice.retry", "invoice.remind", "billing.refund", "pricing.read", "pricing.write", "coupon.write", "tenant.read"],
  support: ["tenant.read", "tenant.impersonate", "notification.read", "notification.send", "observability.read", "audit.read"],
  sales: ["tenant.read", "tenant.create", "tenant.update", "edition.read", "pricing.read", "subscription.manage"],
  read_only: Object.values(HOST_PERMISSIONS).filter((k) => k.endsWith(".read")),
};

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS] | HostPermission;

/** All catalog values — used to validate custom-role grants against the catalog. */
export const ALL_PERMISSIONS: readonly Permission[] = [...Object.values(PERMISSIONS), ...Object.values(HOST_PERMISSIONS)];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}
