# Construction Intelligence — Phase 0

> An **empty but enterprise-correct deployable skeleton** with the measurement
> instruments and the framework live — **before any product feature exists**. This
> is deliberate. The five MVP modules (TenderLogix, DocLogix, QuantLogix, DrawLogix,
> CostLogix) drop into this skeleton in Phases 1–7. Phase 0 ships **zero features on
> purpose** — read [`CLAUDE.md`](./CLAUDE.md) before writing any code.

Two runtimes, one seam. **AI proposes; the domain disposes.**

```
apps/web         Next.js 15 — presentation + BFF + domain (modular monolith)
services/ai      FastAPI — stateless AI workers (arq/seam consumers)
packages/db      Drizzle schema, migrations, scoped repositories, RLS, audit
packages/shared  job contract · permission catalog · roles · lifecycle (source of truth)
packages/ui      design system: tokens + core components
packages/config  shared biome / tsconfig / tailwind preset
packages/eval    the eval harness — the instrument that gates AI changes
infra/           docker-compose (mariadb+phpmyadmin, redis, minio) · mysql-init
```

> **Database: MariaDB / XAMPP (ported from PostgreSQL).** This deployment runs on
> MariaDB 10.4 (XAMPP) instead of the original PostgreSQL + pgvector. The one
> architectural consequence you must know: **MariaDB has no Row-Level Security, so
> tenant isolation is enforced in application code** (the scoped repository's
> `org_id` filter — `packages/db/src/scoped.ts`), not by the database. There is no
> fail-closed DB backstop; every owned-table access MUST go through the scoped
> repository. Vector search (pgvector) is replaced by JSON-stored embeddings +
> app-side cosine similarity. Audit immutability is preserved (DB triggers).

## Environment runbook (fresh machine → running stack, §4)

Node 22, pnpm (corepack), Python 3.12. Database is **MariaDB via XAMPP** (start
MySQL in the XAMPP Control Panel; default root user, no password, port 3306).

```bash
pnpm install                                   # JS deps (Turborepo workspace)
cp .env.example .env                           # then fill AUTH_SECRET + the API keys
# Start XAMPP's "MySQL" (MariaDB) from the control panel, then:
pnpm db:setup                                  # create db + non-DDL ci_app user (once)
pnpm db:migrate                                # apply migrations (as root)
pnpm db:seed                                   # tenants A + B + probe rows
pnpm dev                                        # turbo runs web (3000) + ai (8000) + worker
```

- Browse the DB at **phpMyAdmin** (XAMPP: <http://localhost/phpmyadmin>).
- Redis is still required for the AI seam round-trip (XAMPP doesn't ship it). Run a
  local Redis, or `docker compose -f infra/docker-compose.yml up -d redis minio`.
- Don't have XAMPP? `pnpm infra:up` brings up MariaDB + phpMyAdmin (:8080) + redis +
  minio in Docker — then set root's password in `DATABASE_URL` (see the compose note).

Verify:
- Web: <http://localhost:3000>  ·  AI: <http://localhost:8000/health>
- **Seam round-trip (exit gate #1):** `curl "http://localhost:3000/api/probe?echo=hi"`
  → `{"ok":true,"echo":"hi",...}` (TS → Redis → Python → TS)

## The 8 exit gates — "Phase 0 is done" when ALL are green (§2)

| # | Gate | Where it's proven | State in this scaffold |
|---|------|-------------------|------------------------|
| 1 | Skeleton deploys; no-op job round-trips both runtimes | `GET /api/probe`, `app/worker.py` | **Wired** — run it via the runbook |
| 2 | Tenant provably isolated (app-enforced; MariaDB has no RLS) | `packages/db/src/isolation.test.ts` + `migrations.yml` | **Wired** — scoped-repo filter + test (needs DB) |
| 3 | RBAC enforced server-side from the single catalog; custom role | `server/authz.ts`, `@ci/shared/permissions`, `roles` table | **Wired pattern**; Better Auth session read is the one TODO |
| 4 | Every consequential action writes an **immutable** audit record | `@ci/db audit()` + BEFORE UPDATE/DELETE triggers in `0000_init.sql` | **Wired** |
| 5 | CI runs both runtimes; **eval gate** fires on AI-touching changes | `.github/workflows/*` | **Wired** — eval harness verified locally (passes + gates) |
| 6 | Observability: traced request end-to-end; threshold changeable | `telemetry.py`, `thresholds` table, correlationId on the envelope | **Scaffolded** — Langfuse wiring is config (ws 0.8) |
| 7 | App shell renders auth-gated; design system + backend templates in use | `app/(app)/layout.tsx`, `@ci/ui`, `domain/_template` | **Wired** |
| 8 | No product features exist — the discipline | (everything above) | **Held** |

## What is WIRED vs. STUBBED in this scaffold

**Wired (load-bearing patterns, real code):** the §3 monorepo + workspace; the job
contract + thin TS queue client + Python seam consumer (round-trips); app-enforced
tenant isolation via `withTenant` + scoped repository + the non-DDL `ci_app` user +
the cross-tenant isolation test; the immutable audit spine
(`audit()` + DB triggers); the permission catalog + `requirePermission`
guard; expand-contract migrations + the destructive-op CI guard; env validation at
boot (Zod + Pydantic); the design-system tokens/components + the auth-gated shell;
the bounded-context template + the five-step use-case spine; the agent/orchestrator
typed-pipeline scaffold; the eval harness (verified: runs + gates); CI workflows;
deploy-stub Dockerfiles; thresholds-as-config table.

**Stubbed (explicit TODOs, by ticket):**
- **Better Auth** session/account tables + the real `resolveContext` session read
  (ws 0.3) — `server/context.ts` is fail-closed until then.
- **Langfuse** container + per-call spans (ws 0.8) — telemetry shape is in place.
- **Anthropic/Voyage** real calls (Phase 1/3) — adapters raise `NotImplementedError`
  behind the fixed provider seam, on purpose.
- **MFA (TOTP)** enrolment scaffold (ws 0.3.5).

## Open decisions to resolve during Phase 0 (§9)
- **Hosting / compute platform** — containerized regardless (Dockerfiles exist);
  `deploy-stub.yml` ships to a placeholder. Finalize without re-architecting.
- **Secrets-manager product** — env-injected + validated at boot; swap the source
  later, app code already reads from the validated `env` object.

## Stack
Next.js 15 · TypeScript · Drizzle · Better Auth · Tailwind + shadcn-style · Biome ·
FastAPI · arq · Pydantic · Anthropic (Opus/Haiku) · Voyage · **MariaDB 10.4 (XAMPP)**
· Redis · MinIO↔R2 · Langfuse · Turborepo + pnpm · GitHub Actions.

> Ported from the originally-ratified **PostgreSQL 16 + pgvector** to MariaDB/XAMPP
> at the operator's request. Trade-off accepted: tenant isolation is app-enforced
> (no RLS) and vector search is app-side (no pgvector). See `CLAUDE.md` → *Database
> deviation*.
