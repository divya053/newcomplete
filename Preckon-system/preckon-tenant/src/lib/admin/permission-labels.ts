// Human names for the things a role can do.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// The role editor listed a permission like this:
//
//   [ ] admin.branding — white-label (logo, brand colour)
//
// The identifier was the headline, set in mono, and the explanation trailed
// after a dash in grey. So the first thing a person read was a database key,
// and the sentence that told them what the checkbox actually does came second.
// A commercial manager deciding whether the new QS can approve a bid should not
// have to parse `bid.approve` to find out.
//
// It was also English-only and could not be otherwise: the descriptions live in
// tenant_permission, one row per permission, one language per row. Translating
// them at the database would mean a column per locale and a migration per
// language.
//
// So the names live here, in the dictionaries, and the key becomes what it
// always was — an identifier, available when an administrator wants it and out
// of the way when they do not.
//
// ── THE FALLBACK MATTERS ─────────────────────────────────────────────────────
//
// permissionCatalog() returns "Core keys + pack additions", so a pack can
// introduce a permission this dictionary has never heard of. translate()
// returns the key itself when it has no entry, which would put `perm.foo.bar`
// on screen — worse than the raw key it replaced. Every lookup below therefore
// checks for that and falls back to the description the catalog supplied.

import type { Key } from "@/lib/i18n";

type T = (key: Key, vars?: Record<string, string | number>) => string;

/** A translation, or `null` when the dictionary has no entry for this key. */
function lookup(t: T, key: string): string | null {
  const k = key as Key;
  const out = t(k);
  // translate() echoes the key back when it misses. That echo is the signal.
  return out === k ? null : out;
}

/**
 * What this permission lets someone do, in their language.
 *
 * Falls back to the catalog's own English description, which is still a
 * sentence a person can read — unlike the key.
 */
export function permLabel(t: T, permKey: string, description?: string | null): string {
  return lookup(t, `perm.${permKey}`) ?? description ?? permKey;
}

/**
 * The extra line under the label, where one adds something.
 *
 * Optional by design: most permissions are fully said in their label, and a
 * second line of text on all nineteen of them would be noise. Returns null when
 * there is nothing worth adding, and the caller renders no second line.
 */
export function permHint(t: T, permKey: string): string | null {
  return lookup(t, `permHint.${permKey}`);
}

/** The group heading — "Projects" rather than the `project` domain key. */
export function domainLabel(t: T, domain: string): string {
  return lookup(t, `permDomain.${domain}`) ?? domain;
}

/**
 * A role's name in the reader's language.
 *
 * Only the system roles are translated: their keys are fixed and shipped with
 * the product. A role the customer created is THEIR name for it, typed in their
 * own words, and translating it would be putting words in their mouth — so it
 * is returned exactly as entered.
 */
export function roleLabel(t: T, role: { key?: string; name: string; is_system?: boolean | number }): string {
  if (!role.is_system || !role.key) return role.name;
  return lookup(t, `role.${role.key}`) ?? role.name;
}

/** One line saying what a tier means, for the person choosing one. */
export function tierHint(t: T, tier: string): string | null {
  return lookup(t, `tierHint.${tier}`);
}
