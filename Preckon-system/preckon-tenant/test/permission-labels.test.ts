// A permission reads as a sentence, and an unknown one still does.
//
// ── WHAT THIS REPLACED ───────────────────────────────────────────────────────
//
// The role editor headlined the database key:
//
//   [ ] admin.branding — white-label (logo, brand colour)
//
// set in mono, with the explanation trailing after a dash in grey. So the first
// thing a person read was an identifier, and it was English-only and could not
// be otherwise — the descriptions live one-per-row in tenant_permission.
//
// ── THE TRAP ─────────────────────────────────────────────────────────────────
//
// translate() returns the KEY when it has no entry for it. So a naive
// t(`perm.${p.key}`) puts `perm.foo.bar` on screen for any permission the
// dictionary has not got — which is worse than the raw key it replaced, and
// permissionCatalog() explicitly serves "Core keys + pack additions", so
// unknown permissions are a designed-for case rather than a hypothetical.
//
// Every test below is about that fallback holding.

import { describe, it, expect } from "vitest";
import { permLabel, permHint, domainLabel, roleLabel, tierHint } from "@/lib/admin/permission-labels";
import { en } from "@/lib/i18n/en";
import { CORE_PERMISSIONS } from "@/lib/pack/core";

/** A stand-in for the real t(): looks up en, and echoes the key on a miss. */
const t = ((k: string) => (en as any)[k] ?? k) as any;
/** A locale with nothing in it, to prove the fallbacks and not the dictionary. */
const tEmpty = ((k: string) => k) as any;

describe("a permission reads as a sentence", () => {
  it("uses the dictionary label, not the key", () => {
    expect(permLabel(t, "admin.branding", "white-label (logo, brand colour)")).toBe("Change branding");
    expect(permLabel(t, "bid.approve", "authorize a tender for submission"))
      .toBe("Authorise a tender for submission");
  });

  it("never returns the i18n key itself", () => {
    // The specific failure this guards: `perm.foo.bar` rendered to a customer.
    const out = permLabel(tEmpty, "pack.something.new", "does a pack thing");
    expect(out).not.toMatch(/^perm\./);
    expect(out).toBe("does a pack thing");
  });

  it("falls back to the catalog description for a permission it has never seen", () => {
    // A pack can add permissions. They are not in any dictionary and must still
    // render as the sentence the catalog supplied.
    expect(permLabel(t, "safety.inspect", "raise and close site inspections"))
      .toBe("raise and close site inspections");
  });

  it("falls back to the key only when there is no description either", () => {
    // Ugly, and still the honest last resort: a key beats an empty row.
    expect(permLabel(t, "mystery.thing", null)).toBe("mystery.thing");
    expect(permLabel(t, "mystery.thing", undefined)).toBe("mystery.thing");
  });
});

describe("the optional second line", () => {
  it("is present where one adds something", () => {
    expect(permHint(t, "project.read_all")).toBe("Bypasses project membership entirely");
  });

  it("is null — not the key — where there is nothing to add", () => {
    // Rendering the key here would print `permHint.project.create` under the
    // label. The caller checks for null and renders no second line.
    expect(permHint(t, "project.create")).toBeNull();
    expect(permHint(tEmpty, "anything.at.all")).toBeNull();
  });
});

describe("group headings", () => {
  it("name the group in words", () => {
    expect(domainLabel(t, "project")).toBe("Projects");
    expect(domainLabel(t, "workflow")).toBe("Automation");
  });

  it("fall back to the domain key for a domain a pack introduced", () => {
    expect(domainLabel(t, "safety")).toBe("safety");
    expect(domainLabel(tEmpty, "project")).toBe("project");
  });
});

describe("role names", () => {
  it("translate the system roles", () => {
    expect(roleLabel(t, { key: "qs_reviewer", name: "QS / Reviewer", is_system: 1 })).toBe("QS / Reviewer");
    expect(roleLabel(t, { key: "precon_lead", name: "Precon Lead", is_system: 1 })).toBe("Precon Lead");
  });

  it("leave a customer's own role exactly as they typed it", () => {
    /* The one rule worth stating: a role the customer created is THEIR name for
       it, in their words. Translating it would be putting words in their mouth,
       and there is no dictionary entry to translate it with anyway. */
    const custom = { key: "site_agent_night", name: "Night Shift Agent", is_system: 0 };
    expect(roleLabel(t, custom)).toBe("Night Shift Agent");
    expect(roleLabel(tEmpty, custom)).toBe("Night Shift Agent");
  });

  it("falls back to the stored name for a system role with no entry", () => {
    expect(roleLabel(tEmpty, { key: "owner", name: "Owner", is_system: 1 })).toBe("Owner");
  });
});

describe("tier hints", () => {
  it("say what the tier means, because 'Delivery' does not", () => {
    expect(tierHint(t, "delivery")).toBe("Does the work. Creates and edits, on their own projects");
    expect(tierHint(t, "view")).toBe("Reads only. Changes nothing");
  });

  it("returns null rather than a key for an unknown tier", () => {
    expect(tierHint(tEmpty, "delivery")).toBeNull();
  });
});

describe("every permission the product ships has a label", () => {
  // The fallback exists for pack additions, not as cover for forgetting to
  // translate a core permission. Reading the catalog itself means a permission
  // added without a label fails here rather than in front of a user.
  it("reads the real catalog, so this is not vacuous", () => {
    expect(CORE_PERMISSIONS.length).toBeGreaterThan(10);
  });

  it("has an English label for every core permission", () => {
    const missing = CORE_PERMISSIONS.map((p) => p.key).filter((k) => !(en as any)[`perm.${k}`]);
    expect(
      missing,
      `\n\nCore permissions with no label. Each would silently fall back to the\n` +
        `English database description in every language:\n  ${missing.join("\n  ")}\n`,
    ).toEqual([]);
  });

  it("has a group heading for every domain the catalog uses", () => {
    const domains = [...new Set(CORE_PERMISSIONS.map((p) => p.domain))];
    expect(domains.filter((d) => !(en as any)[`permDomain.${d}`])).toEqual([]);
  });

  it("labels say what the person can DO, not what the row is called", () => {
    /* The point of the exercise. A label that is just the key with the dots
       taken out ("Admin branding") has moved no one forward. */
    for (const p of CORE_PERMISSIONS) {
      const label = permLabel(t, p.key, p.description);
      expect(label.toLowerCase()).not.toBe(p.key.replace(/[._]/g, " "));
      expect(label).not.toMatch(/^perm\./);
    }
  });
});
