# Bounded-context template (ws 0.10.1)

Copy this folder to `src/domain/<module>/` to start a new module (TenderLogix,
DocLogix, QuantLogix, DrawLogix, CostLogix). It is **scaffolded, not invented** —
every module is the same shape so feature #20 looks like feature #1.

```
<module>/
  model.ts        domain types + Zod input schemas (boundary validation)
  repository.ts   tenant-scoped repository (extends @ci/db ScopedRepository)
  use-cases/      one file per operation — each follows the 5-step spine
  events.ts       domain events this context emits
  index.ts        the ONLY import surface (other code imports from here)
```

## The five-step spine EVERY use-case follows (guardrails #2/#3/#4/#6)

```
validate (Zod) -> authorize (requirePermission) -> tenant-scope (withTenant)
  -> do the work (scoped repository) -> audit (audit() hook) [+ cost/trust telemetry]
```

See `use-cases/example-publish.ts` for the canonical implementation. Learn it once;
every operation in every module reads the same.

> Anything that touches a model or a document is **async** (guardrail #9): it goes
> out as an arq job (validated payload, idempotency key, retry/DLQ, user-visible
> `failed` state) and comes back as a *proposal* the domain decides to persist.
