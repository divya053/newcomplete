# CLAUDE.md — Architecture Law (the operating contract)

> Read this before writing any code. These are the **10 guardrails** from the Phase 0 Build
> Guide (§7). Do not violate them. If a task seems to require breaking one, **stop and flag it** —
> design behind the interface, don't hardcode a guess.

> ## ⚠️ Database deviation — MariaDB / XAMPP (ported from PostgreSQL)
> This deployment was ported from the ratified PostgreSQL 16 + pgvector to **MariaDB 10.4 (XAMPP)**
> at the operator's explicit request. The port is real, but one guardrail could not be preserved
> as-written and is now satisfied differently — know this before touching data code:
> - **Law #2 (tenant isolation):** MariaDB has **no Row-Level Security**. Isolation is now
>   **enforced in application code** — the scoped repository's `org_id` predicate
>   (`packages/db/src/repositories/base.ts`, entered via `withTenant`). There is **no fail-closed DB
>   backstop**: a raw unscoped query against an owned table WILL leak across tenants. So the rule
>   "never a raw unscoped query; always go through the scoped repository" is now **load-bearing**,
>   not belt-and-braces. New owned tables must be reached only through a `ScopedRepository`.
> - **Vector tables:** no pgvector. Embeddings are stored as JSON arrays; cosine similarity is computed
>   app-side (`packages/db/src/schema/probe.ts`).
> - **Law #4 (immutable audit):** preserved — enforced by `BEFORE UPDATE/DELETE` triggers that reject
>   mutation for every user (stronger than the old per-role REVOKE).
> - Type map: `uuid → CHAR(36)`, `timestamptz → DATETIME(3)`, `jsonb → JSON`. App connects as the
>   non-DDL `ci_app` user; migrations run as root.

This repo is **Construction Intelligence — Phase 0**: an empty but enterprise-correct deployable
skeleton. It ships **zero product features on purpose**. Its job is to make every future module
(TenderLogix, DocLogix, QuantLogix, DrawLogix, CostLogix — built in Phases 1–7) a *drop-in*, not an
invention. Feature #20 must look and behave like feature #1.

## The seam, stated once
**Two runtimes, one seam. AI proposes; the domain disposes.** The Python AI tier (`services/ai`) is
**stateless** and owns no state or lifecycle — it consumes an arq job, runs an agent, returns a
*proposal*. All truth lives in the TypeScript domain (`apps/web/src/domain`), which decides what to
persist and in which lifecycle state. The only thing crossing runtimes is an **arq job on Redis** —
no shared DB writes, no direct calls.

## The 10 laws

1. **AI proposes; domain disposes.** The Python AI tier is stateless and owns no state or lifecycle.
   All truth lives in the TS domain. The AI tier returns results; it never writes domain state.
2. **Tenant isolation is mandatory.** Every owned table has `org_id` — *including vector tables*. All
   data access goes through the scoped repository that injects the tenant filter; never a raw unscoped
   query. *(MariaDB port: there is no RLS policy backstop — the scoped repository's `org_id` predicate
   IS the boundary. See the Database deviation note above.)*
3. **Authorization ≠ isolation.** RBAC (permissions) is a separate axis from tenant isolation (RLS).
   Both are always required. Permissions are checked **server-side only**, always from the catalog in
   `packages/shared` — never an ad-hoc string.
4. **Audit everything consequential.** Lifecycle transitions, permission/role changes, deletes/archives,
   exports, and threshold changes write an immutable audit record via the `audit()` hook. Audit rows are
   never updated or deleted.
5. **Migrations are expand-contract.** Additive only; never a destructive in-place change that breaks
   running code. CI rejects destructive migrations.
6. **Validate every boundary input.** Zod on the TS side, Pydantic on the Python side. No unvalidated
   external input crosses a boundary.
7. **Thresholds are derived & configurable.** Trust thresholds (COGS, accuracy, calibration) live as
   versioned, audited config — a dial, not a constant.
8. **Framework-first.** Build from the design-system tokens/primitives (`packages/ui`) and the backend
   scaffolding templates. No one-off styles or bespoke patterns — extend the system. New
   contexts/agents/jobs are scaffolded from the templates.
9. **Anything touching a model or a document is async.** An arq job, idempotent (idempotency key),
   with a retry/DLQ path and a user-visible `failed` state.
10. **No secrets in source. Ever.** Secrets are env-injected from the manager and validated at boot.

## The shape EVERY operation (and every module) takes
```
validate (Zod/Pydantic) -> authorize (requirePermission) -> tenant-scope (withTenant)
  -> do the work (scoped repository) -> audit (audit() hook) [+ cost/trust telemetry]
```
Learn it once; every operation reads the same. See `apps/web/src/domain/_template/`.

## The artifact lifecycle every module rides
```
AI Generated -> Draft -> Under Review -> Approved -> Published -> Archived
```
Confidence scores + source citations travel with the artifact; every transition is audited.

## Where things live (§3 layout)
```
apps/web            Next.js 15 — presentation + BFF + domain (modular monolith)
  app/              App Router routes        → PRESENTATION
  src/server/       server actions / handlers → APPLICATION (BFF)
  src/domain/       bounded contexts (modules live here) → DOMAIN
  src/lib/          cross-cutting: auth, db, queue client, env
services/ai         FastAPI — stateless AI workers (arq consumers)
packages/db         Drizzle schema, migrations, scoped repositories
packages/shared     permission catalog, job contracts, shared types/enums
packages/ui         design system: tokens + core components
packages/config     shared biome / tsconfig / tailwind preset
infra/              docker-compose (mariadb+phpmyadmin, redis, minio) · mysql-init
```

## Settled conventions (do not relitigate without cause)
- **Import alias:** `@ci/*` for workspace packages (e.g. `@ci/shared`, `@ci/db`, `@ci/ui`).
- **PKs:** UUIDv7 app-side, stored as `CHAR(36)` (MariaDB fallback default `(UUID())`).
- **Tables:** snake_case, plural, every owned table carries the `_base.ts` columns.
- **Enqueue:** write arq-format payloads to Redis directly from the thin typed TS queue client.
- **Tenant scoping:** `withTenant(orgId, …)` opens a tx and sets `@app_current_org`; the scoped
  repository injects `WHERE org_id = …` on every query (app-enforced — MariaDB has no RLS).
- **Stack** (Next 15, Drizzle, Better Auth, **MariaDB 10.4 / XAMPP**, FastAPI, arq, Anthropic, Voyage,
  Langfuse). The DB was deliberately swapped from Postgres+pgvector (see the deviation note); don't
  substitute the rest without a *stated* requirement.

## The discipline
If a task implies a **product feature**, stop — it belongs in a later phase. Phase 0 ships no features.
Phase 0 is done only when the **8 exit gates** (see `README.md` §Exit Gates) are each provably green.
