/**
 * The canonical artifact lifecycle every module's AI-generated artifact rides
 * (§8.3, Canon §5). BOQ, takeoff, estimate, package — all move through these
 * states, with confidence scores + source citations travelling alongside, and
 * every transition audited (guardrail #4).
 */
export const LIFECYCLE_STATES = [
  "ai_generated",
  "draft",
  "under_review",
  "approved",
  "published",
  "archived",
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/** Allowed forward transitions. The domain enforces these; the AI tier never sets state. */
export const LIFECYCLE_TRANSITIONS: Record<LifecycleState, readonly LifecycleState[]> = {
  ai_generated: ["draft", "under_review", "archived"],
  draft: ["under_review", "archived"],
  under_review: ["approved", "draft", "archived"],
  approved: ["published", "under_review", "archived"],
  published: ["archived"],
  archived: [],
};

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}
