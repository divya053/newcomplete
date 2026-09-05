# Preckon — Demo Logins (Host control plane)

Host staff sign in at the console (local: http://localhost:3000). Staff use the
operator domain `@techsme.com`.

## Where the passwords are

**They are not in this file, and must not be added to it.** This repository is
the artefact that gets cloned onto servers and shared with reviewers; a password
committed here is a password in everyone's git history, on every clone, for as
long as the repo exists — and rotating it later does not remove it from history.

This file previously listed all three in plain text, and this repository has been
publicly readable since July. Those three passwords must be treated as known and
rotated regardless of what is written here now.

The seed creates the first Owner through the sign-up endpoint, which is closed to
anything that cannot present `INTERNAL_SERVICE_TOKEN`. Give it a password you
generated:

```bash
OWNER_EMAIL=you@techsme.com OWNER_PASSWORD='<generated, 12+ chars>' \
  npm run seed:owner
```

`seed-owner.mjs` reuses an existing account rather than resetting it, so this is
safe to run against a database whose passwords have already been rotated.

## The accounts

| Name | Email | Role |
|---|---|---|
| Platform Owner | `admin@techsme.com` | Owner |
| Shruthi | `shruthi@techsme.com` | Admin |
| Pranavi | `pranavi@techsme.com` | Admin |

Reproduce after a fresh DB:

```bash
docker compose up -d --build
docker compose --profile tools run --rm seed   # owner + demo tenant registration
npm run seed:staff                             # Shruthi + Pranavi (Admin) — app must be up
```

`seed:staff` is idempotent (safe to re-run) and driven by `scripts/seed-staff.mjs`.

## Before anything is publicly reachable

- Set `OWNER_PASSWORD` per environment. Never rely on the compose default —
  `docker-compose.yml` still carries a literal, which is its own defect.
- Rotate `BETTER_AUTH_SECRET` and `INTERNAL_SERVICE_TOKEN`; both had known
  placeholder values in this repo's history. Note that on this plane the app
  service reads neither from `.env` — they are hardcoded in `docker-compose.yml`
  and must be set in `docker-compose.override.yml`.
- `INTERNAL_SERVICE_TOKEN` must match the tenant plane's, or tenant provisioning
  fails with a 401 and nothing else looks wrong.
- Change the database password from the compose default.
- Confirm 3307 (MySQL) is not reachable from outside the host. The compose file
  binds it to 127.0.0.1; reach it over an SSH tunnel, not an open port.

> The tenant workspace has its own logins — see `preckon-tenant/DEMO-CREDENTIALS.md`.
