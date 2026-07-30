import { PERMISSIONS, type Permission } from "./permissions";

/**
 * The 5 seeded SYSTEM roles (ws 0.3). Each org gets its own copy at creation, and
 * can define custom roles whose grants must reference catalog permissions only.
 * Role → permission resolution happens server-side; the UI never decides access.
 */
export const SYSTEM_ROLES = ["owner", "admin", "estimator", "reviewer", "viewer"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

const P = PERMISSIONS;

/** Default grants per system role. Owner is implicitly all; the rest are explicit. */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  owner: Object.values(P), // everything
  admin: [
    P.PROJECT_CREATE, P.DOCUMENT_UPLOAD, P.BOQ_APPROVE, P.ESTIMATE_PUBLISH,
    P.ROLE_MANAGE, P.AUDIT_READ, P.THRESHOLD_MANAGE, P.BRANDING_MANAGE, P.ADMIN_MANAGE_USERS,
    P.TENDER_PROJECT_MANAGE, P.TENDER_DOCUMENT_UPLOAD, P.TENDER_BOQ_GENERATE, P.TENDER_BOQ_APPROVE, P.TENDER_BOQ_EXPORT,
    P.DRAWLOGIX_PROJECT_MANAGE, P.DRAWLOGIX_DOCUMENT_UPLOAD, P.DRAWLOGIX_GENERATE, P.DRAWLOGIX_APPROVE,
  ],
  // Estimator runs the AI pipelines + manages projects/docs, but does NOT sign off.
  estimator: [
    P.PROJECT_CREATE, P.DOCUMENT_UPLOAD, P.ESTIMATE_PUBLISH,
    P.TENDER_PROJECT_MANAGE, P.TENDER_DOCUMENT_UPLOAD, P.TENDER_BOQ_GENERATE, P.TENDER_BOQ_EXPORT,
    P.DRAWLOGIX_PROJECT_MANAGE, P.DRAWLOGIX_DOCUMENT_UPLOAD, P.DRAWLOGIX_GENERATE,
  ],
  // Reviewer approves artifacts through the lifecycle but doesn't generate.
  reviewer: [
    P.DOCUMENT_UPLOAD, P.BOQ_APPROVE, P.AUDIT_READ,
    P.TENDER_DOCUMENT_UPLOAD, P.TENDER_BOQ_APPROVE, P.TENDER_BOQ_EXPORT,
    P.DRAWLOGIX_APPROVE,
  ],
  viewer: [],
};
