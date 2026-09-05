# Preckon — Access, Infrastructure and Operations, v3.0

**Everything needed to get in, run it, deploy it, and know whether it is working**

5 September 2026

The complete reference for the Preckon platform: two planes, one VPS, four repositories. It
supersedes the 3 September consolidated document and the v2.x access revisions, and folds
their content into a single document that can be read start to finish by someone who has
never seen the system.

Everything here is read from the repository, the compose files and the git remotes on
5 September 2026. Where a fact can only come from the running server, it is marked **OPEN**
and Part 10 gives the command that answers it. Nothing has been assumed to be true because
it ought to be.

| Parts | Defects logged | Need one command | Decisions needed | Review points closed |
|---|---|---|---|---|
| 11 | 12 | 4 | 3 | 9 |

> ### READ THIS BEFORE ANYTHING ELSE
>
> Earlier versions of this document listed the root server password and three console
> passwords in plain text. This monorepo autosyncs to a **public** GitHub repository every
> ten minutes, and has since July. Those passwords are absent here — which is cleanup, not
> remediation. They are in the history of a public repository and cannot be taken back.
> Rotate all four. Part 7.4 gives the order that actually closes it, and §10.1 records that
> the two console passwords are **still committed in five tracked files today** — including
> two seed scripts that silently fall back to them, so running the host seed with no
> environment provisions a publicly-known credential and reports success.

## How to read this

| If you are… | Start at |
|---|---|
| A new engineer getting access | Part 2, then Part 3. Sections 2.3 and 3.4 are the two things that will otherwise cost you a day |
| Standing the system up | Part 3, then §4.4 for migrations and Part 9 to confirm it worked |
| Deploying or rolling back | Part 6. Read §6.3 before you need it, not during |
| Reviewing the security posture | Part 7, then the defect register in §10.1 |
| Looking for a specific value | Part 11 is the reference. §2.2 is what somebody has to send you |

---

# PART 1 — What the system is

Two independent planes with two identity pools, deployed as two Docker Compose stacks on one
VPS behind one nginx. They share nothing but a token and a contract.

## 1.1 The two planes

| Plane | What it is | Directory | Origin |
|---|---|---|---|
| **Host** | The control plane. TechSME defines features → editions → pricing, manages every tenant, runs billing, operates the platform | `/opt/preckon-host` | `host.preckon.com` |
| **Tenant** | The product. An AI-native construction workspace where agents propose and humans dispose | `/opt/preckon-tenant` | `app.preckon.com` |

The tenant plane consumes exactly one thing from the Host: a resolved entitlement snapshot,
fetched from `GET /api/host/v1/internal/entitlements/{tenant_id}` with the shared service
token. Entitlements are computed from the resolution view and overrides, never stored, and
never depend on Stripe — Stripe only mirrors money.

> **Two planes means two identity pools.** Host staff live in Better Auth plus `host_user`.
> Tenant users never appear on the Host plane at all. A Host login will not get you into a
> workspace and a workspace login will not get you into the console. This is the design, not
> a gap — and it is why §2.2 lists two separate sets of credentials.

## 1.2 The containers

| Service | Plane | What it does | Holds a DB handle? |
|---|---|---|---|
| `app` | both | Next.js 15 — the API and the UI in one process | Yes |
| `db` | both | MySQL 8. Schema and seed auto-import on first init only | — |
| `phpmyadmin` | tenant | Database admin UI | Yes |
| `worker` | tenant | The stateless AI worker. Runs agents, calls Claude | **No** |
| `cad` | tenant | DXF/DWG extraction sidecar. A pure function of the bytes | **No** |
| `seed` | both | One-off, profile `tools`. Registers the pack catalog | Yes |

> **The trust boundary is structural, not a convention.** The worker package declares no
> database driver at all, and `test/trust-boundary.test.ts` asserts that structurally — it
> fails if anyone adds one. The worker receives a job envelope, computes, and posts the result
> back to Core over HTTP. Core is the only thing that writes the artifact store. The `cad`
> sidecar is the same shape, and its uploads volume is mounted read-only.

## 1.3 Domain-neutral core, construction as data

Preckon Core knows nothing about construction. A vertical is one file satisfying the
`DomainPack` contract plus one line in the registry: modules, artifact types with JSON
schemas, agents with typed inputs and outputs, workflows as DAGs, personas, a lifecycle state
machine, a role template and permissions. A tenant binds to exactly one domain at
provisioning. Two packs exist today — construction and underwriting — and both pass the same
generic resolver test.

This matters operationally for one reason: **the artifact schemas live in the database**,
registered from the pack at seed time. They are not read from source. Deploying code without
re-registering the catalog leaves the server validating against the previous shape, and every
write touching a newly added field is rejected at runtime. §6.2 is built around that.

## 1.4 The four ABI syscalls

```
emitArtifact      propose an artifact  (Core materialises it; the worker never writes)
readArtifacts     read what already exists
enqueueJob        schedule work  /  onJobResult  receive it back
requestReview     pause at a gate for a human
```

The runtime is a deterministic fixpoint scheduler over those: agent steps, review gates that
pause at `awaiting_review` and resume on confirm, `map` fan-out and fan-in, and partial
re-runs when a confirmed artifact is edited and its downstream goes stale.

---

# PART 2 — Getting access

## 2.1 The server

| Property | Value |
|---|---|
| Address | `74.208.182.201` |
| OS | AlmaLinux 9 |
| Resources | 12 vCore · 24 GB RAM · 720 GB NVMe SSD |
| SSH user | `root` — every deployment script uses `root@$PRECKON_HOST` |
| Host plane | `/opt/preckon-host` |
| Tenant plane | `/opt/preckon-tenant` |
| Backups | `/opt/preckon-backups` |
| Reverse proxy | nginx, terminating TLS for both origins |
| Orchestration | `docker compose`, one stack per plane, all ports loopback-bound |

## 2.2 The values somebody has to send you

These are deliberately not in this document. What follows is the exact set — which is shorter
than the environment-variable inventory in §11.3 suggests, because most of those names are
hardcoded in the compose files and are never read from `.env`.

**Two files per plane, not one:**

```
/opt/preckon-tenant/.env      /opt/preckon-tenant/docker-compose.override.yml
/opt/preckon-host/.env        /opt/preckon-host/docker-compose.override.yml
```

Neither is in any repository. `update-from-git.sh` excludes both from its rsync and the deploy
tarball excludes `.env`, deliberately: the local `.env` would point the deployed app at
`localhost` and would carry `AUTH_SIGNIN_MAX=200`, which must never be set on anything
publicly reachable.

### Tenant — four required, one that decides behaviour

The first four are demanded by `docker-compose.yml` with `:?` — the stack refuses to start
without them rather than falling back to a default.

| Variable | Needed by | Why you cannot generate it yourself |
|---|---|---|
| `DATABASE_PASSWORD` | app · seed · db | Must match the existing database. Rotated 1 September |
| `BETTER_AUTH_SECRET` | app · seed | Regenerating it invalidates every existing session |
| `INTERNAL_SERVICE_TOKEN` | app · worker | Must match the **host** plane's — §2.4 |
| `TENANT_OWNER_PASSWORD` | seed profile | Demanded by compose, then never read — §3.4 |
| `ANTHROPIC_API_KEY` | worker only | Absent, every AI job **fails**. Not access, but nothing AI works without it |

### Host — one from `.env`, three from the override file

| Variable | Where it is really set |
|---|---|
| `DATABASE_PASSWORD` | `/opt/preckon-host/.env` |
| `BETTER_AUTH_SECRET` | `docker-compose.override.yml` — **not** read from `.env`, see D7 |
| `BETTER_AUTH_URL` | `docker-compose.override.yml` — must be `https://host.preckon.com` |
| `INTERNAL_SERVICE_TOKEN` | `docker-compose.override.yml` — must match the tenant's |

Everything else on the Host is optional and degrades explicitly rather than crashing.
`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` blank → billing runs mirror-only and skips live
Stripe calls, logged. `EMAIL_API_KEY` blank → email is logged, not sent. `STORAGE_*` blank →
local `./storage`. You can do real work with all of them empty.

> **Decision, not an answer.** How these nine values reach a new starter. Until a password
> manager or vault exists they are sent out of band, which is how the last set ended up in a
> document that syncs publicly. Creating a vault entry is a twenty-minute decision and it is
> the single cheapest item in this document.

## 2.3 Database access is an SSH tunnel — and do not sign in through it

Every published port on both planes binds to `127.0.0.1`. There is no direct database access
and there should not be.

| Service | Published | Plane |
|---|---|---|
| Host console | `127.0.0.1:3000` | host |
| Host MySQL | `127.0.0.1:3307` | host |
| Tenant workspace | `127.0.0.1:3100` | tenant |
| Tenant MySQL | `127.0.0.1:3308` | tenant |
| Tenant phpMyAdmin | `127.0.0.1:8081` | tenant |
| Worker `/claude` proxy | `127.0.0.1:4000` | tenant |

```bash
ssh -N \
  -L 3307:127.0.0.1:3307 \
  -L 3308:127.0.0.1:3308 \
  -L 8081:127.0.0.1:8081 \
  root@74.208.182.201

# then point your client at 127.0.0.1:3308 for the tenant database
```

> **The tunnel is for data, not for signing in.** Do **not** open the app at
> `http://127.0.0.1:3100`. Better Auth CSRF-checks the request `Origin` against
> `BETTER_AUTH_URL`, which on the server is the public origin — so signing in through the
> tunnel fails the origin check and returns something that reads as bad credentials. Use
> `https://app.preckon.com` for the app and the tunnel for the databases, phpMyAdmin and the
> worker proxy.

> **Do not "fix" the bind addresses.** Docker writes its own iptables rules **ahead of**
> ufw's, so a published container port stays reachable from the internet even when
> `ufw status` reports it denied — the firewall reports success and the port is open. For
> anything in a compose file the bind address is the only control we own. Widening 3307 or
> 3308 to save a tunnel puts MySQL on the internet.

## 2.4 The one cross-plane constraint

`INTERNAL_SERVICE_TOKEN` must be **the same string on both planes.** The Host provisions
tenants by calling the tenant plane's `/api/internal/tenants/{id}/bootstrap` with its own
token as a bearer credential (`preckon-host/src/lib/integrations.ts:109`), and the tenant
validates it against its own value. If the two differ, tenant creation fails with a 401 and
nothing else looks wrong. The same token gates the tenant's whole `/internal` surface — job
callbacks from the worker, and both seed scripts.

---

# PART 3 — Running it

## 3.1 Local — the whole stack in Docker

```bash
cd preckon-tenant
cp .env.example .env          # then fill in the four required values
docker compose up --build -d  # db · phpmyadmin · app · worker · cad
docker compose --profile tools run --rm seed    # registers the pack catalog
```

| What | URL | Notes |
|---|---|---|
| Tenant workspace | `http://localhost:3100` | See §3.4 — the seed above gives you no login |
| Host console | `http://localhost:3000` | `npm run seed:owner` creates the first staff account |
| phpMyAdmin | `http://localhost:8081` | server `db`, user `root`, password from your `.env` |
| Tenant MySQL | `localhost:3308` | database `preckon_tenant` |
| Host MySQL | `localhost:3307` | database `preckon_host` |
| Worker health | `http://localhost:4000/healthz` | stateless, no DB access |

## 3.2 Local — app outside Docker

```bash
cp .env.example .env          # set DATABASE_PORT=3308 to reach the compose DB
npm install
docker compose up -d db       # just MySQL — loads db/schema.sql on FIRST init only
npm run seed                  # register the pack catalog
node worker/src/server.mjs    # terminal 1 — :4000
PORT=3100 npm run dev         # terminal 2 — :3100
```

> **First init only.** `db/schema.sql` and `db/seed.sql` load through MySQL's
> `docker-entrypoint-initdb.d`, which runs **once**, on the first initialisation of the data
> volume. Editing either and running `up` again does nothing. To genuinely reset:
> `docker compose down -v`, which drops the `db_data` volume, then `up --build`. Everything
> after that first boot is a migration — §4.4.

## 3.3 The Host plane's first account

```bash
cd preckon-host
npm install
npm run db:import        # schema + platform seed  (or import both .sql in phpMyAdmin)
npm run dev              # :3000
npm run seed:owner       # creates the first Owner staff account — dev server must be up
```

`db/seed.sql` is platform configuration only — permissions, roles, the feature and edition
catalog, pricing, currencies, settings, AI routing. No sample tenants and no business data, so
the console starts clean. `db/seed-demo.sql` adds fake tenants, invoices and notifications if
you want something to look at.

> **Override the seeded password.** `npm run seed:owner` defaults to a published credential —
> see D9. Always pass your own:
> `OWNER_EMAIL=you@techsme.com OWNER_PASSWORD='min-12-chars' npm run seed:owner`.
> The script reuses an existing account rather than resetting it, so this is safe to run
> against a box where the password has already been rotated.

## 3.4 Getting into a tenant workspace — the part that is not obvious

> ### The compose seed creates no login
>
> `docker compose --profile tools run --rm seed` runs `npm run seed` → `scripts/seed.mjs`,
> whose entire body is `seedCatalog()`. It registers the construction pack and nothing else.
> `TENANT_OWNER_EMAIL` and `TENANT_OWNER_PASSWORD` are passed into that container
> (`docker-compose.yml:164–165`) and are **never read by the command it runs**. The tenant
> README describes this step as "seed demo tenant/owner/project", which it is not. **(D11)**

Logins are created by two separate scripts, run over HTTP against the **already-running app**
— not by the compose seed.

| Script | Creates | Requires |
|---|---|---|
| `node scripts/seed-aigcc.mjs` | `owner@aigcc.group`, plus team, rate book, standards and precedent library, and a portfolio of live tenders | `INTERNAL_SERVICE_TOKEN`, `SEED_OWNER_PASSWORD` |
| `node scripts/seed-cedarstone.mjs` | The Cedar & Stone logins only — no projects, no library | `INTERNAL_SERVICE_TOKEN`, `BOOTSTRAP_OWNER`, `BOOTSTRAP_PASSWORD` |

Both hard-stop if their variables are missing rather than defaulting to a published literal —
a seed that invents a credential is indistinguishable from one that was configured properly,
which was the original problem. A run with no environment exits `2`.

```bash
# either: read the password the box already uses
grep -E '^(TENANT_OWNER_PASSWORD|SEED_OWNER_PASSWORD)=' /opt/preckon-tenant/.env

# or: create a workspace with a password you choose
cd /opt/preckon-tenant
INTERNAL_SERVICE_TOKEN=<the app's> SEED_OWNER_PASSWORD=<yours> \
  node scripts/seed-aigcc.mjs
```

### The tenant-id trap, which you will hit next

Two workspace ids are in play. Seeding the default gives you a workspace that works but that
the Host console does not manage or license, which looks like a broken entitlement and is not.

| Workspace id | What it is |
|---|---|
| `…0000a1` | What `seed-aigcc.mjs` creates. The local and standalone default |
| `…000001` | What `preckon-host/scripts/seed-demo-tenant.mjs` registers — the workspace the **Host plane actually manages** |

```bash
# make Host → Tenant line up
TENANT_ID=00000000-0000-7000-8000-000000000001 node scripts/seed-cedarstone.mjs
```

---

# PART 4 — Data

## 4.1 The databases

| Database | Plane | Tunnel port | Contents |
|---|---|---|---|
| `preckon_host` | host | `3307` | 32 tables across 10 domains, plus Better Auth tables |
| `preckon_tenant` | tenant | `3308` | The artifact store, jobs, audit chain, library, pack catalog |

## 4.2 Tenant isolation — application-layer, deliberately

The original design specified PostgreSQL Row-Level Security. The chosen requirement was
phpMyAdmin, which manages MySQL and MariaDB only, and neither has RLS. So tenancy is enforced
in the repository layer instead:

- Every tenant-scoped table keeps a `tenant_id` column.
- Every scoped query carries `AND tenant_id = ?` — `requireProject()` in `src/lib/context.ts`
  is the single choke point.
- `test/tenancy.test.ts` asserts that a cross-tenant read returns zero rows. That test is the
  RLS equivalent, and it is the thing to run after touching the store.

`pgvector` is the other casualty of the same decision: semantic retrieval is stubbed, with a
`FULLTEXT` index standing in. Worth knowing before anyone plans a feature on it.

## 4.3 The audit chain

Append-only, per-tenant, SHA-256 hash-chained, written by the `append_audit_event` stored
procedure under a `GET_LOCK`, with `BEFORE UPDATE` and `BEFORE DELETE` triggers enforcing
immutability. On the Host plane every mutation is audited in the same transaction as the write
— `useCase(ctx, (conn, audit) => …)` — so there is no write path without an audit event.

```
GET /api/v1/audit/verify              # tenant — re-walks the chain
GET /api/host/v1/audit-events/verify  # host   — same
```

Run one of these after any restore. A backup that restores a broken chain is worth knowing
about immediately rather than at the point somebody needs the audit trail to be defensible.

## 4.4 Migrations

Forward-only, and every migration is written to be re-runnable — each `ALTER` is guarded on
`information_schema` — so applying them twice is safe. Use the shell runner on the server: the
Node runner needs `mysql2` and a `DATABASE_URL`, and the tenant runtime image ships only
`.next/standalone`, so it has no scripts directory and no npm to run.

```bash
cd /opt/preckon-tenant
sh scripts/migrate.sh --dry     # list what would run
sh scripts/migrate.sh           # apply, stopping at the first failure
```

It stops on the first failure rather than continuing, because a half-migrated schema is worse
than an unmigrated one.

> **Defect D4.** `migrate.sh:22` defaults `DB_PASS` to the pre-rotation literal. On a box whose
> password was rotated on 1 September it will fail on every migration until `DB_PASS` is passed
> explicitly or the default is changed to read `DATABASE_PASSWORD` from `.env` — the fix
> already made to `backup.sh`.

---

# PART 5 — The AI stack

## 5.1 Where the key lives

`ANTHROPIC_API_KEY` is read by the **worker only**. The app container never sees it
(`docker-compose.yml:72`), and QA case T-88 asserts exactly that. The worker also fronts a
small proxy at `/claude` on `:4000`, so the app can have Claude answer without holding a
credential. One file, one service, one place to rotate.

## 5.2 `DEMO_STUB_MODE` — what is live and what is invented

A deterministic stub can stand in for a real agent so the runtime — gates, provenance, stale
and re-plan, audit, map fan-out — can be exercised without model nondeterminism. What it must
never do is what it used to do: return invented quantities as `status: "succeeded"`,
indistinguishable from a real bill. Somebody prices work from that.

| `NODE_ENV` | `DEMO_STUB_MODE` | Stub output | Meaning |
|---|---|---|---|
| any | `true` | **Permitted** | Explicit and deliberate — demo boxes only |
| `production` | unset / anything else | **None** | The job **fails** and says the key is missing |
| development / test | unset | Permitted | Exercise the runtime without a key |

On this deployment the worker image pins `NODE_ENV=production` and compose passes the variable
through as `${DEMO_STUB_MODE:-}`, so only **two live states** are possible: unset, which is
correct, or `true`, which means every AI result on the box is invented and reported as a
success.

```bash
cd /opt/preckon-tenant
docker compose logs worker | grep 'Claude:'

# what a correctly configured box says:
[worker] Claude: configured · stub output: refused
         (NODE_ENV=production and DEMO_STUB_MODE is not set)
```

The worker announces this at boot rather than letting it be discovered one job at a time, and
prints a warning line if stubs are permitted in production. Read the boot line rather than the
`.env` file — the file is not necessarily what the running container has.

## 5.3 Cost is metered per attempt

`ai_usage_ledger` is append-only, one row per **attempt** including failed ones (ADR-006,
migration `021_ai_governance.sql`). A job that spends tokens on attempt 1, fails validation and
succeeds on attempt 2 records both — recording only the successful attempt hides exactly the
spend that a retry loop generates. `ai_job` carries the last-attempt summary; total spend lives
in the ledger.

## 5.4 Recommended: a separate development key

One key with one budget means no per-consumer attribution — a test run and a customer's bill of
quantities are the same line item, and a runaway loop in development is indistinguishable from
real workload until the invoice arrives. Because the key is worker-only and spend is already
metered per attempt, separating them costs one console visit and one line in a `.env`.

| Step | Why |
|---|---|
| Create a second key in a **separate Anthropic workspace** | Attribution and a cap belong to the workspace, not the key |
| Put a monthly spend limit on the dev workspace | Caps the blast radius of a loop, which is the actual risk |
| Leave production uncapped but **alerted** | A hard cap on production is an outage waiting for a busy week |
| Dev key in the `.env` of the box you test against, never in the repo | The autosync credential guard matches `sk-ant-` shapes, but it is a net, not a policy |
| Use the dev key even against production data | The ledger then attributes your spend separately |
| Rotate the production key at the same time | It has lived in a `.env` on a box still serving a plain-HTTP vhost, and `DEPLOY.md` tells anyone deploying to append it by hand |

## 5.5 Drawings

The `cad` sidecar parses DXF natively through ezdxf and converts DWG with **LibreDWG**, which
is built into the image — nothing to download, register for or install on the host. The ODA
File Converter is preferred when present because its fidelity on awkward older DWGs is better;
set `EZDXF_ODAFC` and mount it, and the sidecar tries ODA first and falls back. Configuring it
can only improve results.

If a drawing defeats both, the upload is marked **failed** with a message telling the estimator
to re-save as DXF. It is never silently ingested as unreadable bytes — a drawing that looks
understood but is not is how a bill of quantities quietly loses a discipline. Note the `cad`
image builds LibreDWG from source, so the first build takes several minutes; later builds hit
the layer cache.

---

# PART 6 — Deploy, rollback and backups

## 6.1 Which path is the deploy path

There are three, which is two too many. `scripts/update-from-git.sh` is the one to use and the
one to make canonical.

| Path | Shape | Use it? |
|---|---|---|
| `scripts/update-from-git.sh` | Server pulls from GitHub, rsyncs, migrates, re-seeds the catalog, rebuilds | **Yes** |
| `deploy.ps1` | Windows: package a tarball, scp it up, build on the server | No |
| `DEPLOY.md` runbook | The same tarball flow by hand | No |

> **Why the server pulls rather than receiving a copy.** Pasting the packaging half of the
> tarball flow into an SSH session silently produces a 45-byte empty tarball, scp's *that* over
> the good one, and then every `docker compose build` reports success with every layer
> **cached** — a deploy that looks perfect and ships nothing. `deploy.ps1` refuses to run
> anywhere but Windows and checks the size of what arrived, precisely because of that. Pulling
> avoids the whole class.

## 6.2 What `update-from-git.sh` does

1. `git clone --depth 1` of `PRECKON_REPO`, default `techsmeinc/preckon-tenant`. It detects
   whether the repo holds a plane at its root or nests it, rather than assuming.
2. `rsync -a --delete` into `/opt/<plane>/`, excluding `.env`, `docker-compose.override.yml`,
   `node_modules`, `.next`, `.uploads`, `__pycache__` and `test-results`.
3. Every `db/migrations/*.sql`, in order.
4. Rebuild the seeder, then run it to re-register the pack catalog. This **fails the deploy**
   if it fails — artifact schemas that do not match the running code mean every write touching
   a new field is rejected at runtime, which is an application that is up and quietly broken.
   The seeder is rebuilt first deliberately: without that, `run` reuses whatever seed image is
   on the box, registers the *old* catalog over the new code, and reports success.
5. `docker compose build`, then `up -d`, for `app`, `worker` and `cad`.

> ### The deploy path does not currently work — D1
>
> `update-from-git.sh:84` runs the migrations as `mysql -uroot -ppreckon`. That password was
> rotated on 1 September. Under `set -euo pipefail` the step exits non-zero and the deploy
> aborts before it builds anything. The same stale literal is in `DEPLOY.md:41` and `:61`,
> defaulted in `deploy.ps1:54`, and defaulted in `migrate.sh:22`. Four files, one fix — the one
> already applied to `backup.sh` in commit `bae5035`. Step 3 should call `migrate.sh` rather
> than carrying its own loop.

## 6.3 Rollback: there isn't one

Stated plainly, because assuming otherwise is how a bad deploy becomes an outage.

- The clone is `--depth 1` on the default branch, so it cannot be asked for a previous commit.
- `rsync --delete` is destructive — the previous tree is gone, not shadowed.
- Images are built in place with no tag, so `docker compose up` cannot be pointed at
  yesterday's image.
- Migrations are forward-only. There are no down scripts.

Today, rollback means redeploying from an earlier commit by hand, and any migration applied in
between stays applied. What would change that, in order of value for effort:

| Change | Effect |
|---|---|
| Run `backup.sh` as step 0 of every deploy | A restore point that matches the code that broke |
| `PRECKON_REF` support and a full clone | Deploy a named commit — therefore redeploy a previous one |
| Tag images with the commit sha | Roll back without rebuilding |
| Keep the previous tree as `/opt/<plane>.prev` | Recover a file without a network round trip |

## 6.4 Backups

`backup.sh` dumps with `--single-transaction --quick --routines --triggers --events`, gzips,
then **restores the dump into a scratch database** and compares table counts plus row counts on
`audit_event`, `artifact`, `project`, `document_register` and `ai_usage_ledger` before keeping
the file. It fails loudly if the restore does not match. Routines and triggers are included
because the audit chain lives in a stored procedure, and a backup without it restores a
database that cannot append to its own chain.

| Property | Value | State |
|---|---|---|
| Location | `/opt/preckon-backups` (`BACKUP_DIR`) | Confirmed |
| Retention | 14 files (`BACKUP_KEEP`), pruned oldest-first by ISO stamp | Confirmed |
| Verification | Every backup is restored and row-counted before it is kept | Confirmed |
| Schedule | Cron on the server. **Not in the repository** — `crontab -l` | **Open** |
| Restore | `sh scripts/backup.sh --restore <file> <target-db>` | Confirmed |
| Off-box copy | There is none | **None** |
| Host database | `preckon_host` is not backed up at all | **None** |
| Uploaded files | Drawings and documents are not backed up | **None** |

The schedule is a documentation gap rather than a system gap. `backup.sh`'s own comments record
that cron ran it nightly and that from 1 September it wrote 20-byte files for three nights,
because the password was rotated and cron sets no `DB_PASS`. The guard caught it every night
and said so in the log; nobody reads the log. That is fixed — commit `bae5035` reads
`DATABASE_PASSWORD` from `.env` — but the crontab itself is uncommitted, so the hour it runs
has to be read off the box.

> ### The one to fix first
>
> `/opt/preckon-backups` sits on the VPS whose database it protects. A disk failure or a
> provider incident takes the database and all fourteen backups in the same event. Everything
> else in this part is an improvement; this is the difference between having backups and
> believing you do. Combined with §8.5 — no external monitoring is wired — nothing currently
> tells anybody that a backup failed.

### Restoring

```bash
cd /opt/preckon-tenant
sh scripts/backup.sh --restore /opt/preckon-backups/<file>.sql.gz preckon_tenant_check
# then, before switching anything over:
curl -s https://app.preckon.com/api/v1/audit/verify
```

Restore into a scratch database, never over the live one, and verify the audit chain before you
trust it.

---

# PART 7 — Security posture

## 7.1 TLS

nginx terminates for `host.preckon.com` and `app.preckon.com`; the app containers publish to
loopback only and nginx proxies to them. The **renewal mechanism is not in the repository** —
no certbot config, no renew hook, no systemd timer.

```bash
certbot certificates
systemctl list-timers | grep -i certbot
```

If those come back empty the certificate is manual, and its expiry date is the single most
important unknown in this document. A certificate warning in front of a client is unrecoverable
in the moment.

nginx should also send the security headers on every 443 vhost — the app sends its own, but
nginx answers the http→https redirects and its own error pages without ever reaching the app,
and those are exactly the responses an attacker can provoke. Use `always` on each `add_header`,
and run `nginx -t` before every reload. Do not add HSTS `preload` yet: it compiles the domain
into browsers and is effectively irreversible.

## 7.2 The firewall — two layers, and the one that works is not ours

A scan of the production host found nine services listening on `0.0.0.0` and no firewall running
on the host. Testing from outside, with 22, 80 and 443 as controls to prove the test works,
showed everything else filtered — so something upstream, almost certainly the provider's network
firewall, is doing the work.

That is a real difference in urgency and it is worth being exact about: this is **not** a live
exposure. What stays true is that the only thing between an unauthenticated database and the
internet is a rule in a console nobody on this team can see in the repository, which no deploy
re-asserts, and which will be lost in the first provider migration.

| Layer | What it covers | State |
|---|---|---|
| Compose bind addresses | Every published port is `127.0.0.1` | **Done** |
| Provider edge | Permits 22/80/443 only — verified externally | Confirmed |
| Host `ufw` | Allow 22/80/443, then enable. Keep a second terminal open | **Unverified** |
| Ollama `:11434` | Bind to loopback. It has **no authentication of its own** — do this first | Runbook |
| Host MariaDB `:3306` | `bind-address = 127.0.0.1` | Runbook |
| `rpcbind`, `cockpit` | Disable both. `rpcbind` is a reflection-amplification source | Runbook |
| nginx headers, `server_tokens off` | HSTS and friends on every 443 vhost | Runbook |

Full steps are in `preckon-host/docs/SERVER-HARDENING.md`. Check `ufw status verbose` before
assuming any of it is in place — a written runbook is not a configured host.

> **Still open: a plain-HTTP vhost on the production IP.** A legacy api-server on `:5000` from
> `/home/deploy/tenderlogix-autocad`, served over plain HTTP on the bare IP by four duplicate
> nginx blocks. Either bind it to loopback and give its vhost a certificate, or stop it and
> delete the four `server_name` blocks. Leaving it undoes part of everything else in this part.

## 7.3 What the hardening work does and does not establish

It closes the injection window, removes a database and an unauthenticated inference server from
any network path, and stops the console being framed or its assets sniffed. It is **not** a
response to a compromise, and nothing in it establishes whether anything reached those ports
while they were open. If that question matters — and with an unauthenticated MySQL it reasonably
might — it needs its own look at the auth logs, the database logs and the audit chain. That is
separate work from shutting the doors.

## 7.4 The credential exposure, and the order that closes it

A file removed from one branch is not removed from a repository, and a repository that has been
public for six weeks cannot be made private retroactively. The order matters:

1. **Rotate** the three account passwords and the server password. They have been publicly
   readable for six weeks. Everything else is cleanup; this is the only step that removes the
   exposure. It locks three colleagues out until they are told the new ones, which is why it is
   a decision rather than a task.
2. **Delete the credential files from the monorepo.** That fixes the working copy,
   `preckon-system` on its next publish, and every future push to the public repo.
3. **Fix the five files that still carry them** — D8, and the silent seed fallbacks in D9. Rotating a password
   that a README still documents achieves less than it looks.
4. **Delete `pre-sync-2026-08-13`**, after confirming nobody wants the initial-commit lineage.
   If they do, tag it once the file is purged.
5. **Make the public repository private, or delete it.** This does not un-publish six weeks of
   readable history, and forks or clones may exist.
6. **Purge from history** with `git filter-repo`. Last, because it is the most disruptive and
   the least urgent once the passwords are dead.

The branch-by-branch detail — which refs still serve `DEMO-CREDENTIALS.md`, and why
`preckon-system` holds both copies — is in `Preckon_Branches_and_Repositories_v1.0.docx`.

---

# PART 8 — Repositories, branches and publishing

## 8.1 The four repositories

| Repository | Visibility | Role |
|---|---|---|
| `divya053/newcomplete` | **public** | Working monorepo. Autosync pushes every ten minutes since July |
| `techsmeinc/preckon-system` | private | Organisation artefact — subtree of `Preckon-system/` |
| `techsmeinc/preckon-tenant` | private | Tenant plane at its root. **What the server deploys from** |
| `techsmeinc/preckon-host` | private | Host plane at its root |

## 8.2 What deploys to production

`main` of `techsmeinc/preckon-tenant` and `techsmeinc/preckon-host`. `update-from-git.sh` clones
`--depth 1` with no `--branch`, so it takes the default branch. There is no staging branch and
no environment-per-branch. Work happens in the monorepo; a nightly mirror publishes subtree
splits into the three organisation repositories; feature branches (`agent/*`) are opened against
the org repos.

## 8.3 Two things to know before you push

- `preckon-host` has **no common ancestor** with the monorepo subtree, so git refuses to merge
  them. It is published by overlay — start from the remote tip, lay the subtree content on top
  as one commit. The remote's history is preserved and extended, the push is a fast-forward, and
  files that exist only on the remote survive because an overlay adds and updates but never
  deletes.
- Pushing to `preckon-tenant` fails unless `.github/workflows/ci.yml` is excluded: the token in
  use has no `workflow` scope.

> **Why the mirror merges instead of force-pushing.** The obvious mirror is split-and-force: the
> monorepo is the source of truth and the org repositories are artefacts. That is wrong here,
> and was nearly expensive. Two directories had been deleted directly on GitHub and those
> deletions existed only on the remote — a force-push of a fresh split would have resurrected
> fourteen files somebody deliberately removed, silently, on a schedule, forever.

## 8.4 AutoCAD-BOQ-Tender

Not a remote, which is why it is easy to miss. It is a **directory at the monorepo root** — 442
files tracked in the monorepo and published to `techsmeinc/preckon-system`. Its own
`.gitmodules` declares a submodule `tenderlogix-autocad` pointing at
`github.com/techsmeinc/tenderlogix-autocad.git`, but the working tree has those files committed
as **ordinary blobs**, not a gitlink. Two copies exist: the org repository, and the checked-in
one that actually ships.

It is a separate application from the two planes: DrawLogix (Next, `:3001`, basePath
`/drawlogix`), a portal on `:5173`, an API server on `:5000` and a Python sidecar, with its own
environment in `DrawLogix/.env.local`. On the VPS it is the `:5000` process behind the
plain-HTTP vhost in §7.2.

> **Decision needed.** Is it in scope? And if the organisation repository is authoritative, the
> monorepo copy should become a real submodule or be deleted. Right now it is neither, so there
> is no answer to "which copy is the one that runs" other than "the checked-in one, by accident".

## 8.5 Observability — what is real and what is a facade

Real, in-product: queue health, AI health, failed jobs, throughput, audit verification, artifact
trace and provenance — correlated by `trace_id`, `job_id` and `tenant_id`, with an audit event
trail and provenance edges.

> ### Not real
>
> There is **no external dashboard wired** — no Datadog, no Grafana, no Sentry, no CloudWatch.
> The Host observability endpoints are read-through facades returning realistic shapes until
> arq/Redis and Langfuse are wired. Do not plan on alerting that does not exist. In particular,
> nothing pages anybody when a backup fails, a certificate nears expiry, or the AI queue stalls.

---

# PART 9 — Knowing it works

A deploy that reports success is not the same as a system that works, and this system has
several ways of being up and quietly wrong.

## 9.1 After every deploy

```bash
cd /opt/preckon-tenant
docker compose ps --format '{{.Service}}\t{{.Status}}'
docker compose logs worker | grep 'Claude:'      # key present? stubs refused?
curl -s localhost:4000/healthz                    # worker
curl -s localhost:3100/api/healthz                # tenant core
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/checklist.html   # host, expect 200
curl -s https://app.preckon.com/api/v1/audit/verify
```

The worker boot line is the highest-value single check on the box: it says in one line whether
Claude is configured and whether substitute output is permitted, which together determine
whether anything you are looking at is real.

## 9.2 The test suites

| Suite | Proves | Command |
|---|---|---|
| `test/skeleton.test.ts` | The seven end-to-end steps: ingest → tender → gate pause → confirm → resume → boq → gate, with provenance, stale propagation, supersede and re-run, and the audit chain verifying | `npm test` |
| `test/tenancy.test.ts` | App-layer tenant isolation — a cross-tenant read returns zero rows. The RLS equivalent | `npm test` |
| `test/trust-boundary.test.ts` | The worker declares no DB dependency and imports no store module | `npm test` |
| `test/packs.test.ts` | The generic resolver runs every domain pack with zero errors | `npm test` |
| `e2e/` | Playwright — login and the full core-loop journey | `npm run test:e2e` |

Tests need a seeded MySQL on 3308: `docker compose up -d db && npm run seed`, then `npm test`.
The skeleton test drives the real runtime with an in-process dispatcher, so it needs no worker
container and is fully deterministic.

> **`AUTH_SIGNIN_MAX` and the e2e suite.** Sign-in throttles at three attempts per minute, which
> is the point. `AUTH_SIGNIN_MAX` exists only so the local e2e suite — which signs in once per
> test — can run. It must stay **unset** on anything publicly reachable, and the deploy tarball
> excludes the local `.env` specifically so a local value of 200 cannot reach the server.

## 9.3 The QA checklist

A static page baked into the Host image at build time, served at `/checklist.html` on whatever
origin serves the Host console. Because it is baked in, publishing an updated one means
rebuilding the host — copying a file into a running container vanishes on the next recreate.
Results are stored per browser in `localStorage`, so each tester keeps their own, and Export CSV
pulls from the same case list the page renders.

## 9.4 Retiring stub-era artifacts

A project that ran before `ANTHROPIC_API_KEY` was set carries records that look real and are
not. Clear them without breaking provenance:

```bash
node scripts/retire-artifacts.mjs --project <pid> --before 2026-08-01 --dry-run
node scripts/retire-artifacts.mjs --project <pid> --before 2026-08-01 \
  --reason "stub-agent output"
```

It supersedes rather than deletes, so downstream records keep their lineage, and writes one
audit entry through the chain's stored procedure. Verify after with `GET /api/v1/audit/verify`.

---

# PART 10 — Defects, open items and decisions

## 10.1 Defect register

| # | Where | Defect | Severity |
|---|---|---|---|
| D1 | `update-from-git.sh:84` | Migrations run with the pre-rotation password. Under `set -euo pipefail` the deploy aborts. **The documented deploy path is broken today** | Critical |
| D2 | `DEPLOY.md:41, :61` | The same stale literal in the runbook a new starter would follow | High |
| D3 | `deploy.ps1:54` | `$DbPass` defaults to the pre-rotation password | High |
| D4 | `scripts/migrate.sh:22` | `DB_PASS` defaults to the pre-rotation password | High |
| D5 | `scripts/backup.sh` | Covers `preckon_tenant` only; backups live on the disk they protect; uploads not covered | High |
| D6 | deploy design | No rollback path exists — §6.3 | High |
| D7 | `preckon-host` compose:53–55 | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `INTERNAL_SERVICE_TOKEN` are hardcoded `change-me-*` literals, **not** read from `.env`, despite the README saying to change them there | High |
| D8 | five tracked files, below | The two published console passwords are still committed as literals in files that sync to a public repository | High |
| D9 | `preckon-host/scripts/seed-owner.mjs:17`, `seed-staff.mjs:13` | Both **silently default** to a published password: `process.env.OWNER_PASSWORD ?? "preckon-admin-2026"`. Running either seed with no environment provisions a publicly-known credential and reports success | **Critical** |
| D10 | `preckon-host/.github/workflows/ci.yml` | The host plane's CI has **no secret scan**. The tenant plane's runs gitleaks over full history as its own job. This is why the asymmetry in D8 exists | High |
| D11 | `preckon-tenant` compose:164–165 | The seed service demands `TENANT_OWNER_PASSWORD` with `:?` and never reads it; `TENANT_OWNER_EMAIL` is still `owner@riverside.build`; the README calls this step "seed demo tenant/owner/project" | Medium |
| D12 | `preckon-tenant` README quick start | Documents a stale login and a pre-rotation phpMyAdmin password | Medium |

> **Four files, one fix.** D1 to D4 are the same stale literal in four places, and the fix is the
> one already applied to `backup.sh` in commit `bae5035`: read `DATABASE_PASSWORD` from `.env`
> rather than defaulting to a value that was true until somebody improved security. A credential
> that can drift from the database's is one that will stop working on exactly the day it is
> rotated — the worst possible day for it to stop.

### D8 in full — where the published passwords still are

A sweep of the tracked tree on 5 September, after removing them from
`preckon-host/DEMO-CREDENTIALS.md`:

| File | Occurrences | Kind |
|---|---|---|
| `preckon-host/scripts/seed-owner.mjs` | 2 | **Silent fallback** — see D9 |
| `preckon-host/scripts/seed-staff.mjs` | 1 | **Silent fallback** — see D9 |
| `preckon-host/docker-compose.yml` | 1 | `OWNER_PASSWORD:` literal on the seed service |
| `preckon-host/README.md` | 2 | Documentation, steps 4 and "Run with Docker" |
| `preckon-tenant/IMPLEMENTATION.md` | 2 | Documentation, lines 224 and 241 |
| `preckon-tenant/test/scan-secrets.test.ts` | 2 | **Legitimate** — a regression fixture asserting the scanner catches this literal. Leave it |

`preckon-host/DEMO-CREDENTIALS.md` carried three more and has been rewritten to hold
none — it now points at `OWNER_PASSWORD` the way the tenant file points at
`TENANT_OWNER_PASSWORD`.

> ### The asymmetry is structural, not an oversight
>
> The tenant plane was hardened and the host plane was not, because the guard only exists
> on one of them. The tenant repo has `scripts/scan-secrets.mjs`, a regression test for
> this exact literal, and a CI job running gitleaks with `fetch-depth: 0` — full history,
> because a secret removed from the tip is still a secret. The host repo's CI runs
> typecheck, Playwright and a Docker smoke test, and nothing else. Its seed scripts still
> default to published credentials while the tenant's equivalents call `required()` and
> exit `2`. Fixing D8 file by file without adding the scan to the host plane leaves nothing
> to stop it recurring.

## 10.2 Four things need one command on the box

| Question | Command |
|---|---|
| Live `DEMO_STUB_MODE` | `docker compose logs worker` — read the `Claude:` boot line |
| Backup schedule | `crontab -l` |
| TLS renewal and expiry | `certbot certificates` · `systemctl list-timers` |
| Has the hardening runbook been run? | `ufw status verbose` · `ss -tlnp` |

None of these are unknowable. They are unknown because nobody with server access has run them
and written the answer down — which is the same reason access is the blocking item, and it is
blocking for everyone rather than for any one person.

## 10.3 Three decisions, which are not technical questions

| Decision | Why it needs a person, not an investigation |
|---|---|
| How credentials reach a new starter | Vault or out of band. Out of band is how the last set ended up in a public repository |
| Rotating the four published passwords | It locks three colleagues out until they are told the new ones |
| Whether AutoCAD-BOQ-Tender is in scope, and which copy is authoritative | Two copies exist and neither is declared canonical |

## 10.4 Not in the repository at all

- Who holds the registrar account and the DNS zone for `preckon.com`. Not derivable from the
  code, and only ever missing at the moment a certificate needs a DNS challenge.
- The provider firewall console — the rule set that is currently the only thing filtering nine
  services.
- The backup crontab.
- Any external monitoring or alerting. There is none — §8.5.

---

# PART 11 — Reference

## 11.1 Ports

| Port | Bound to | Service | Reach it via |
|---|---|---|---|
| `3000` | `127.0.0.1` | Host console | `https://host.preckon.com` |
| `3100` | `127.0.0.1` | Tenant workspace | `https://app.preckon.com` |
| `3307` | `127.0.0.1` | Host MySQL | SSH tunnel |
| `3308` | `127.0.0.1` | Tenant MySQL | SSH tunnel |
| `8081` | `127.0.0.1` | phpMyAdmin | SSH tunnel |
| `4000` | `127.0.0.1` | Worker + `/claude` proxy | SSH tunnel |
| `7400` | compose network | `cad` sidecar | Not published |
| `22 / 80 / 443` | public | SSH and nginx | Directly |

## 11.2 Accounts

Passwords are deliberately absent. Where each one comes from:

| Identity | Plane | Role | Password source |
|---|---|---|---|
| `admin@techsme.com` | host | Owner | **Rotate** — published. Also a committed literal, D8/D9 |
| `shruthi@techsme.com` | host | Admin | **Rotate** — published |
| `pranavi@techsme.com` | host | Admin | **Rotate** — published |
| `owner@aigcc.group` | tenant | Owner | `SEED_OWNER_PASSWORD`, via `seed-aigcc.mjs` |
| `owner@cedarstone.build` | tenant | Owner | via `seed-cedarstone.mjs` |
| `dana@` `riya@` `marcus@` `priya@cedarstone.build` | tenant | Colleagues | Same seed unless individually overridden |

None of these are created by the compose seed — §3.4. The stale `Riverside` name is still live
rather than a documentation leftover: `TENANT_OWNER_EMAIL: owner@riverside.build` in the tenant
compose seed service (D11), and in the tenant README's quick start (D12).

## 11.3 Environment variables

An inventory, not a checklist. For the short list somebody has to **send** you, use §2.2 —
working through this list will have you chasing values nobody needs to provide.

**Read from `.env`:**

```
HOST    DATABASE_PASSWORD
        STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET · EMAIL_PROVIDER
        EMAIL_FROM_ADDRESS · EMAIL_API_KEY
        STORAGE_BUCKET · STORAGE_ENDPOINT · STORAGE_ACCESS_KEY · STORAGE_SECRET_KEY

TENANT  DATABASE_PASSWORD · BETTER_AUTH_SECRET · INTERNAL_SERVICE_TOKEN
        TENANT_OWNER_PASSWORD · ANTHROPIC_API_KEY · DEMO_STUB_MODE
        AI_JOB_LEASE_SECONDS · AI_JOB_BACKOFF_SECONDS · AI_JOB_BACKOFF_MAX_SECONDS
        AI_JOB_RECONCILE_SECONDS · AI_JOB_RECONCILE_DISABLED · AUTH_SIGNIN_MAX
```

**Hardcoded in compose — putting these in `.env` does nothing:**

```
TENANT  DATABASE_HOST=db · DATABASE_PORT=3306 · DATABASE_USER=root
        DATABASE_NAME=preckon_tenant · WORKER_URL=http://worker:4000
        CORE_URL=http://app:3000 · CAD_URL=http://cad:7400
        FILE_STORAGE_DIR=/app/.uploads · DESKTOP_DOWNLOAD_DIR=/app/.downloads
        BETTER_AUTH_URL=http://localhost:3100   ← overridden on the server

HOST    BETTER_AUTH_SECRET · BETTER_AUTH_URL · INTERNAL_SERVICE_TOKEN   ← D7
        TENANT_PLANE_URL · EMAIL_PROVIDER · EMAIL_FROM_ADDRESS
```

**Tooling and scripts:**

```
PRECKON_HOST · PRECKON_REPO · BACKUP_DIR · BACKUP_KEEP · DB_PASS · DB_SERVICE
DB_USER · DB_NAME · MIGRATIONS_DIR · EZDXF_ODAFC · TENANT_URL · TENANT_ID
SEED_OWNER_EMAIL · SEED_OWNER_PASSWORD · BOOTSTRAP_OWNER · BOOTSTRAP_PASSWORD
OWNER_EMAIL · OWNER_PASSWORD
```

**The AI job queue, in case you need to tune it.** `ai_job` is a durable queue: dispatch claims
a row and a reconciler restarts work nobody is doing. `AI_JOB_LEASE_SECONDS` (900) must
comfortably exceed your slowest real job — reclaiming one that is merely slow means running it
twice. Backoff is 10s, 40s, 160s, capped at 600. Set `AI_JOB_RECONCILE_DISABLED` where something
else owns recovery, such as a cron hitting `/api/internal/jobs/reconcile`.

## 11.4 API surface

**Tenant — `/api/v1`, cookie-authenticated:**

```
GET  /entitlements · /workflows · /personas · /audit · /audit/verify
GET  POST /projects            GET /projects/{pid}/lifecycle
POST /projects/{pid}/runs      GET /projects/{pid}/runs/{rid}
POST …/runs/{rid}/rerun-stale  POST …/runs/{rid}/review
GET  /projects/{pid}/review-queue
POST /projects/{pid}/artifacts/{id}/confirm | reject     PATCH …/artifacts/{id}
GET  …/artifacts/{id}/trace    ← the defensibility view
POST /projects/{pid}/files     ← upload and ingest
…/conversations + /messages    ← persona chat

internal:  POST /api/internal/jobs/{id}/result
           POST /api/internal/entitlements
           POST /api/internal/tenants/{id}/bootstrap
           POST /api/internal/jobs/reconcile
```

**Host — `/api/host/v1`:** the full control-plane surface across 10 domains, all audited and
RBAC-gated. The tenant plane's one dependency:

```
GET /api/host/v1/internal/entitlements/{tenant_id}
Authorization: Bearer <INTERNAL_SERVICE_TOKEN>
```

## 11.5 Where to look next

| Document | Covers |
|---|---|
| `preckon-host/docs/SERVER-HARDENING.md` | The seven hardening steps, with how to verify each one |
| `preckon-tenant/DEPLOY.md` | The tarball runbook. Note D2 before following it |
| `preckon-tenant/DOMAINS.md` | The `DomainPack` contract and how to add a vertical |
| `preckon-tenant/docs/adr/` | Architecture decisions, including 006 on the per-attempt ledger |
| `Preckon_Branches_and_Repositories_v1.0.docx` | Branch-by-branch survey and the credential sweep |
| `Preckon_Architecture_Reference_v2.0.docx` | Isolation, API, orchestration and prompts |

## 11.6 Read from

```
preckon-host/.env.example              preckon-tenant/.env.example
preckon-host/docker-compose.yml        preckon-tenant/docker-compose.yml
preckon-host/README.md                 preckon-tenant/README.md
preckon-host/docs/SERVER-HARDENING.md  preckon-tenant/DEPLOY.md
preckon-tenant/DOMAINS.md              preckon-tenant/IMPLEMENTATION.md
preckon-tenant/scripts/backup.sh       preckon-tenant/scripts/update-from-git.sh
preckon-tenant/scripts/migrate.sh      preckon-tenant/scripts/seed.mjs
preckon-tenant/scripts/seed-aigcc.mjs  preckon-tenant/scripts/seed-cedarstone.mjs
preckon-tenant/deploy.ps1              preckon-tenant/worker/src/agents.mjs
preckon-tenant/worker/src/server.mjs   preckon-host/src/lib/integrations.ts
preckon-host/scripts/seed-owner.mjs    preckon-tenant/db/migrations/021_ai_governance.sql
preckon-tenant/docs/adr/006-per-attempt-ledger.md
preckon-tenant/docs/qa/preckon-qa-results.csv
AutoCAD-BOQ-Tender/.gitmodules         AutoCAD-BOQ-Tender/TECHNICAL_DOCUMENTATION.md
```

Repository facts read from the git remotes, the index and the working tree on 5 September 2026.
Server facts marked **Open** in §10.2 are read from the repository's own records of the server,
not from the server itself.
