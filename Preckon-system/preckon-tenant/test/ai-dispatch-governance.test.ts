// The dispatch gate.
//
// policy.ts, registry.ts and budget.ts were each already tested in isolation and
// each already correct — and none of them was imported by anything, so none of
// them constrained a single request. These tests are about the seam: that the
// decision is actually taken, that it is taken in the right ORDER, and that it
// fails in the safe direction when the tables it depends on are not there.

import { describe, it, expect } from "vitest";
import { decideDispatch, type DispatchInput } from "@/lib/ai/govern";
import { defaultPolicy, type TenantPolicy } from "@/lib/ai/policy";
import type { ModelEntry } from "@/lib/ai/registry";

const external: ModelEntry = {
  alias: "preckon-reasoning",
  provider: "anthropic",
  providerModel: "claude-sonnet-5",
  boundary: "external",
  capabilities: ["construction_reasoning"],
  contextLimit: 1_000_000,
  rateCard: { inputPerMillionMinor: 300, outputPerMillionMinor: 1500 },
  status: "approved",
};

const local: ModelEntry = { ...external, alias: "preckon-local", boundary: "local" };
const frontier: ModelEntry = { ...external, alias: "frontier-reasoning", boundary: "local", frontier: true };

const base = (over: Partial<DispatchInput> = {}): DispatchInput => ({
  alias: "preckon-reasoning",
  registry: [external, local, frontier],
  policy: defaultPolicy("saas"),
  policyVersion: 3,
  estimatedInputTokens: 1000,
  spend: { todayMinor: 0, projectMonthMinor: 0 },
  fallbackModel: "claude-sonnet-5",
  enforce: true,
  ...over,
});

describe("boundary rules reach the dispatch path", () => {
  it("refuses an external model for unclassified (= confidential) data", () => {
    // The default sensitivity is the whole point: data nobody classified is the
    // data you would least like to hand to a third party.
    const d = decideDispatch(base());
    expect(d.permitted).toBe(false);
    expect(d.reasons).toContain("boundary_not_permitted");
    expect(d.blocked).toBe(true);
    expect(d.why).toMatch(/confidential/);
  });

  it("permits the same model once the data is classified internal", () => {
    const d = decideDispatch(base({ sensitivity: "internal" }));
    expect(d.permitted).toBe(true);
    expect(d.model).toBe("claude-sonnet-5");
    expect(d.executionClass).toBe("external");
  });

  it("permits a local model for confidential data", () => {
    const d = decideDispatch(base({ alias: "preckon-local" }));
    expect(d.permitted).toBe(true);
    expect(d.executionClass).toBe("local");
  });

  it("never lets a tenant widen what its deployment mode allows", () => {
    // A sovereign install that could configure itself back into calling a third
    // party would not be sovereign in any sense a customer would accept.
    const permissive: TenantPolicy = {
      ...defaultPolicy("sovereign"),
      sensitivity: { confidential: { allow: ["local", "preckon", "external"] } },
    };
    const d = decideDispatch(base({ policy: permissive }));
    expect(d.permitted).toBe(false);
    expect(d.reasons).toContain("boundary_not_permitted");
  });
});

describe("order of reasons", () => {
  it("reports a forbidden boundary rather than the budget", () => {
    // If a policy refusal were reported as a budget problem, the operator would
    // raise the budget — and appear to fix it.
    const broke: TenantPolicy = {
      ...defaultPolicy("saas"),
      budgets: { dailyUsdMinor: 1 },
    };
    const d = decideDispatch(base({ policy: broke, estimatedInputTokens: 10_000_000 }));
    expect(d.reasons).toContain("boundary_not_permitted");
    expect(d.reasons).not.toContain("budget_exceeded");
  });

  it("stops an eligible model once the tenant's budget is spent", () => {
    const capped: TenantPolicy = {
      ...defaultPolicy("saas"),
      budgets: { dailyUsdMinor: 500 },
    };
    const d = decideDispatch(base({
      policy: capped,
      sensitivity: "internal",
      spend: { todayMinor: 499, projectMonthMinor: 499 },
      estimatedInputTokens: 5_000_000,
    }));
    expect(d.permitted).toBe(false);
    expect(d.reasons).toEqual(["budget_exceeded"]);
  });
});

describe("failing in the safe direction", () => {
  it("falls back to the configured model when the registry is empty", () => {
    // A fresh install, or a registry table that has not been seeded yet. A
    // governance layer whose first act is to break the product gets reverted.
    const d = decideDispatch(base({ registry: [], enforce: true }));
    expect(d.permitted).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.model).toBe("claude-sonnet-5");
    expect(d.reasons).toContain("model_not_registered");
  });

  it("records the refusal but does not block when enforcement is off", () => {
    const d = decideDispatch(base({ enforce: false }));
    expect(d.permitted).toBe(false);   // the decision is still taken...
    expect(d.blocked).toBe(false);     // ...and deliberately not binding yet
  });

  it("refuses a model that is registered but not approved", () => {
    const candidate = { ...external, status: "candidate" as const };
    const d = decideDispatch(base({ registry: [candidate], sensitivity: "internal" }));
    expect(d.permitted).toBe(false);
    expect(d.reasons).toContain("model_not_approved");
  });
});

describe("what the ledger will record", () => {
  it("carries the policy version and sensitivity of the decision", () => {
    const d = decideDispatch(base({ sensitivity: "internal", policyVersion: 7 }));
    expect(d.policyVersion).toBe(7);
    expect(d.sensitivity).toBe("internal");
    expect(d.estimatedCostMinor).toBeGreaterThan(0);
  });

  it("prices the estimate off the registry's rate card", () => {
    // 1M input tokens at 300 minor/M = 300 minor. The per-request cap that
    // defaultPolicy ships with is lifted here so this measures the rate card
    // and not the budget rule beside it.
    const uncapped: TenantPolicy = { ...defaultPolicy("saas"), budgets: {} };
    const d = decideDispatch(base({
      policy: uncapped, sensitivity: "internal", estimatedInputTokens: 1_000_000,
    }));
    expect(d.estimatedCostMinor).toBe(300);
    expect(d.permitted).toBe(true);
  });
});

// ── Re-route rather than refuse (AIP100-FR-008) ──────────────────────────────
//
// The specification says the router rejects OR RE-ROUTES when a budget would be
// exceeded, and budget.ts lists `cheaper_model` well above `reject` in the order
// to try. Denying outright offered the last remedy first.
//
// The tests that matter most here are the ones asserting what a re-route must
// NOT do. Substituting a cheaper model is a saving the tenant would accept;
// substituting around a boundary rule is a leak, and the two look identical from
// inside the function if the guard is wrong.

const cheap: ModelEntry = {
  ...external,
  alias: "preckon-small",
  providerModel: "claude-haiku-4-5",
  rateCard: { inputPerMillionMinor: 100, outputPerMillionMinor: 500 },
};

describe("re-routing when the budget will not stretch", () => {
  const capped: TenantPolicy = { ...defaultPolicy("saas"), budgets: { singleRequestUsdMinor: 200 } };

  const overBudget = (over: Partial<DispatchInput> = {}) => base({
    policy: capped,
    sensitivity: "internal",
    registry: [external, cheap],
    estimatedInputTokens: 1_000_000,   // 300 on the requested model, 100 on the cheap one
    ...over,
  });

  it("re-routes to a cheaper eligible model instead of denying", () => {
    const d = decideDispatch(overBudget());
    expect(d.permitted).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.alias).toBe("preckon-small");
    expect(d.model).toBe("claude-haiku-4-5");
    expect(d.reasons).toEqual([]);
  });

  it("records what it re-routed from, and says so", () => {
    // A reviewer comparing two runs of the same task needs to know the answer
    // came from a smaller model before concluding the prompt got worse.
    const d = decideDispatch(overBudget());
    expect(d.reroutedFrom).toEqual({ alias: "preckon-reasoning", estimatedCostMinor: 300 });
    expect(d.why).toMatch(/re-routed to preckon-small/);
  });

  it("never raises the bill", () => {
    const d = decideDispatch(overBudget());
    expect(d.estimatedCostMinor).toBe(100);
    expect(d.estimatedCostMinor).toBeLessThan(d.reroutedFrom!.estimatedCostMinor);
  });

  it("leaves reroutedFrom null on the ordinary path", () => {
    const d = decideDispatch(base({ sensitivity: "internal" }));
    expect(d.permitted).toBe(true);
    expect(d.reroutedFrom).toBeNull();
  });

  it("still denies when nothing cheaper is eligible", () => {
    const d = decideDispatch(overBudget({ registry: [external] }));
    expect(d.permitted).toBe(false);
    expect(d.reasons).toEqual(["budget_exceeded"]);
    expect(d.reroutedFrom).toBeNull();
  });

  it("will not re-route to a model that is cheaper but not approved", () => {
    const candidate: ModelEntry = { ...cheap, status: "candidate" };
    const d = decideDispatch(overBudget({ registry: [external, candidate] }));
    expect(d.permitted).toBe(false);
    expect(d.reasons).toEqual(["budget_exceeded"]);
  });

  it("will not re-route to a model whose context window cannot hold the request", () => {
    // A model that would truncate the input is not a cheaper answer, it is a
    // worse one — and the truncation would not be visible in the result.
    const small: ModelEntry = { ...cheap, contextLimit: 100 };
    const d = decideDispatch(overBudget({ registry: [external, small] }));
    expect(d.permitted).toBe(false);
    expect(d.reasons).toEqual(["budget_exceeded"]);
  });

  it("picks the cheapest that fits, not merely the next one down", () => {
    const middling: ModelEntry = {
      ...external, alias: "preckon-middling",
      rateCard: { inputPerMillionMinor: 250, outputPerMillionMinor: 1250 },
    };
    const d = decideDispatch(overBudget({ registry: [external, middling, cheap] }));
    expect(d.alias).toBe("preckon-small");
  });
});

describe("a re-route is a substitution, not an exemption", () => {
  it("does not re-route past a refusal it cannot see", () => {
    // The guard this exercises is `reasons.length === 1`. To reach it the
    // registry MUST hold a cheaper model that is genuinely eligible — otherwise
    // the re-route fails for lack of a candidate and the test passes without
    // ever touching the thing it claims to check.
    //
    // So: the requested model is refused on boundary (external, confidential
    // data), and a cheap LOCAL model sits beside it that the policy does permit.
    // A loose guard re-routes onto it and reports a successful call. The refusal
    // then never appears anywhere, which is the failure — not a leak, but a
    // governance decision that silently stopped being recorded.
    // The ceiling has to sit BETWEEN the two models — 200, against 300 for the
    // requested one and 100 for the substitute. Too tight and the substitute is
    // unaffordable too, the re-route finds nothing, and the test passes for a
    // reason that has nothing to do with the guard. That is the trap this
    // comment exists to stop the next person falling into.
    const cheapLocal: ModelEntry = { ...cheap, alias: "preckon-local-small", boundary: "local" };
    const d = decideDispatch(base({
      alias: "preckon-reasoning",
      registry: [external, cheapLocal],
      policy: { ...defaultPolicy("saas"), budgets: { singleRequestUsdMinor: 200 } },
      estimatedInputTokens: 1_000_000,
    }));
    expect(d.permitted).toBe(false);
    expect(d.reasons).toContain("boundary_not_permitted");
    expect(d.alias).toBe("preckon-reasoning");
    expect(d.reroutedFrom).toBeNull();
  });

  it("does not re-route when the model is unapproved as well as unaffordable", () => {
    // Two reasons, so the budget is not the only thing standing in the way and
    // substituting for cost would leave the other reason unaddressed.
    const unapproved: ModelEntry = { ...external, status: "retired" };
    const d = decideDispatch(base({
      policy: { ...defaultPolicy("saas"), budgets: { singleRequestUsdMinor: 1 } },
      sensitivity: "internal",
      registry: [unapproved, cheap],
      estimatedInputTokens: 1_000_000,
    }));
    expect(d.permitted).toBe(false);
    expect(d.reasons).toContain("model_not_approved");
    expect(d.reroutedFrom).toBeNull();
  });
});
