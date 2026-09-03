# Preckon Consolidated Access And Infrastructure Document

Date: 3 September 2026

This document consolidates the confirmed infrastructure, access, credential, and onboarding details available from the codebase and the VPS details provided separately.

## 1. VPS / Server Details

- VPS IP: `74.208.182.201`
- OS: `AlmaLinux 9`
- CPU: `12 vCore`
- RAM: `24 GB`
- Disk: `720 GB NVMe SSD`
- Current server password: `3270h0Bx0tg1p`
- Expected SSH user: `root`

Note: the deployment docs use `root@$PRECKON_HOST`, so `root` is the inferred default administrative user.

## 2. Deployment Model

The repository indicates a self-hosted deployment model with:

- `preckon-host` deployed under `/opt/preckon-host`
- `preckon-tenant` deployed under `/opt/preckon-tenant`
- `docker compose` for application lifecycle
- `nginx` as the reverse proxy
- loopback-bound app/database ports behind nginx

## 3. Confirmed GitHub Repositories

Confirmed repo remotes found in the workspace:

- `https://github.com/techsmeinc/preckon-system.git`
- `https://github.com/techsmeinc/preckon-host.git`
- `https://github.com/techsmeinc/preckon-tenant.git`

Additional referenced repo:

- `https://github.com/techsmeinc/tenderlogix-autocad.git`

## 4. Applications And Local Environment Endpoints

Confirmed local/default endpoints from the repo:

- Host console: `http://localhost:3000`
- Tenant workspace: `http://localhost:3100`
- Tenant worker health: `http://localhost:4000/healthz`
- Tenant phpMyAdmin: `http://localhost:8081`

Public dev/staging URLs are not present in source and still need to be confirmed separately.

## 5. Database

The active codebase uses `MySQL 8`, not Postgres.

Confirmed databases:

- Host database: `preckon_host`
- Tenant database: `preckon_tenant`

Local mapped DB ports:

- Host DB: `127.0.0.1:3307`
- Tenant DB: `127.0.0.1:3308`

Tenant isolation model:

- tenant-scoped tables carry `tenant_id`
- app queries enforce `AND tenant_id = ?`
- Postgres RLS is not used in this implementation

## 6. Demo Credentials

### Host control plane

- `admin@techsme.com` / `preckon-admin-2026` / Owner
- `shruthi@techsme.com` / `preckon-2026` / Admin
- `pranavi@techsme.com` / `preckon-2026` / Admin

### Tenant workspace

Tenant passwords are intentionally env-driven, not hardcoded in the main docs.

Confirmed tenant identities:

- `owner@cedarstone.build` / password from `TENANT_OWNER_PASSWORD`
- `dana@cedarstone.build` / same seeded password unless overridden
- `riya@cedarstone.build` / same seeded password unless overridden
- `marcus@cedarstone.build` / same seeded password unless overridden
- `priya@cedarstone.build` / same seeded password unless overridden

Additional seeded demo path:

- `owner@aigcc.group` / password from `SEED_OWNER_PASSWORD`

Important note: the tenant repo still contains some older `Riverside` references alongside newer `Cedar & Stone` and `AIGCC` seed paths.

## 7. Environment Variables

### Host `.env`

- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_USER`
- `DATABASE_PASSWORD`
- `DATABASE_NAME`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `INTERNAL_SERVICE_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `EMAIL_PROVIDER`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_API_KEY`
- `STORAGE_BUCKET`
- `STORAGE_ENDPOINT`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`

### Tenant `.env`

- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_USER`
- `DATABASE_PASSWORD`
- `DATABASE_NAME`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `INTERNAL_SERVICE_TOKEN`
- `WORKER_URL`
- `CORE_URL`
- `FILE_STORAGE_DIR`
- `TENANT_OWNER_PASSWORD`
- `ANTHROPIC_API_KEY`
- `DEMO_STUB_MODE`
- `AI_JOB_LEASE_SECONDS`
- `AI_JOB_BACKOFF_SECONDS`
- `AI_JOB_BACKOFF_MAX_SECONDS`
- `AI_JOB_RECONCILE_SECONDS`
- `AI_JOB_RECONCILE_DISABLED`

### Additional runtime / compose variables

- `CAD_URL`
- `DESKTOP_DOWNLOAD_DIR`
- `AUTH_SIGNIN_MAX`
- `EZDXF_ODAFC`
- `TENANT_PLANE_URL`

## 8. API Keys And External Services

Confirmed integrations in code:

- Anthropic
- OpenAI
- Voyage AI
- Stripe
- email provider flow
- object storage
- tenant-plane bootstrap integration

Confirmed key/config references:

- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `EMAIL_API_KEY`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`

Important: live production or staging keys are not stored in the checked-in examples.

## 9. Logs, Tracing, And Observability

Confirmed in-app observability surfaces:

- queue health
- AI health
- failed jobs
- throughput
- audit verification
- artifact trace and provenance

Confirmed correlation fields:

- `trace_id`
- `job_id`
- `tenant_id`
- audit event trail
- artifact provenance edges

Important: the repo does not confirm a real external dashboard already wired, such as Datadog, Grafana, Sentry, or CloudWatch. Current Host observability endpoints are mock/read-through facades, with references to future `Redis/arq` and `Langfuse`.

## 10. Documentation Available In Repo

Key documentation confirmed in the workspace:

- Host README
- Tenant README
- Host API shapes
- Host server hardening
- tenant ADRs
- deployment docs
- QA checklist and results
- AutoCAD/BOQ architecture docs

## 11. Confirmed Domain / Artifact Coverage

Artifact types confirmed in the tenant domain system include:

- `spec_clause`
- `drawing_measurement`
- `boq_line`
- `cost_line`

These are registered through the construction pack and persisted in the tenant DB.

## 12. Items Still Not Confirmed In Code

These details are still missing or not proven by the repository:

- actual public dev URL
- actual public staging URL
- real server-side `.env` values
- real non-prod DB host/user/password
- real third-party API keys
- cloud provider and account/project details
- external logging/dashboard URLs
- complete org-wide repo inventory beyond the repos listed above

## 13. Operational Notes

- The VPS now exists and can be used as the deployment target.
- The server password should be rotated after first login and then stored in a password manager or secret vault.
- The current codebase expects a Docker + nginx deployment shape, not a managed PaaS workflow.
- The current implementation is MySQL-based across both Host and Tenant planes.

## 14. Recommended Immediate Next Steps

1. SSH into `74.208.182.201` as `root`.
2. Install Docker, Docker Compose plugin, git, nginx, and basic hardening packages.
3. Clone or deploy `preckon-host` and `preckon-tenant` into `/opt/preckon-host` and `/opt/preckon-tenant`.
4. Create real `.env` files for both services.
5. set strong replacements for:
   - server password
   - `DATABASE_PASSWORD`
   - `BETTER_AUTH_SECRET`
   - `INTERNAL_SERVICE_TOKEN`
   - tenant demo passwords
6. bring up both stacks with `docker compose`.
7. configure nginx and TLS for the host and tenant domains.

## 15. Source Files Used

- `preckon-host/README.md`
- `preckon-tenant/README.md`
- `preckon-host/.env.example`
- `preckon-tenant/.env.example`
- `preckon-host/docker-compose.yml`
- `preckon-tenant/docker-compose.yml`
- `preckon-host/DEMO-CREDENTIALS.md`
- `preckon-tenant/DEMO-CREDENTIALS.md`
- `preckon-host/db/schema.sql`
- `preckon-tenant/db/schema.sql`
- `preckon-host/db/seed.sql`
- `preckon-host/src/lib/integrations.ts`
- `preckon-tenant/worker/src/agents.mjs`
- `preckon-tenant/DEPLOY.md`
- `preckon-tenant/scripts/update-from-git.sh`
- `preckon-tenant/scripts/seed-aigcc.mjs`
- `preckon-tenant/scripts/seed-cedarstone.mjs`
- `AutoCAD-BOQ-Tender/.gitmodules`
