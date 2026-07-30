-- 0000_init — Phase 0 baseline (MariaDB / XAMPP port). Run by `pnpm db:migrate` AS
-- ROOT. Establishes identity/tenancy, owned tables, the immutable audit spine, and
-- the probe table. Expand-contract only from here (guardrail #5).
--
-- PORT NOTE: this was Postgres (uuid/timestamptz/jsonb + FORCE Row-Level Security).
-- MariaDB 10.4 has NO Row-Level Security, so tenant isolation is enforced in the
-- application (the scoped repository — see packages/db/src/scoped.ts), NOT here.
-- What the DB still enforces: audit-log immutability, via BEFORE UPDATE/DELETE
-- triggers that reject mutation for EVERY user (including root). Type map:
--   uuid -> CHAR(36)   timestamptz -> DATETIME(3)   jsonb -> JSON
-- The non-owner `ci_app` user and its grants are created by `pnpm db:setup`
-- (scripts/setup-mysql.ts) / infra/mysql-init, not in this migration.

-- ──────────────────────────────────────────────────────────────────────────────
-- Identity + tenancy
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orgs (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  name TEXT NOT NULL,
  slug VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY orgs_slug_uq (slug)
) ENGINE=InnoDB;

-- Global identity (the `user` table) is owned by Better Auth — see 0001_auth.sql.

CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_system VARCHAR(16) NOT NULL DEFAULT 'false',
  permissions JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY roles_org_name_uq (org_id, name),
  CONSTRAINT roles_org_fk FOREIGN KEY (org_id) REFERENCES orgs(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS memberships (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  user_id VARCHAR(255) NOT NULL, -- Better Auth user id (FK added in 0001 once `user` exists)
  role_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY memberships_org_user_uq (org_id, user_id),
  CONSTRAINT memberships_role_fk FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

-- ──────────────────────────────────────────────────────────────────────────────
-- Owned domain/config tables (org_id carried; isolation enforced app-side)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS thresholds (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  `key` VARCHAR(255) NOT NULL,
  value JSON NOT NULL,
  version INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tenant_theme (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  logo_asset_key TEXT,
  brand_tokens JSON,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- (probe_vectors — the isolation witness — is created in 0002.)

-- ──────────────────────────────────────────────────────────────────────────────
-- Audit spine — append-only, immutable (ws 0.5, guardrail #4)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id CHAR(36) NOT NULL,
  org_id CHAR(36) NOT NULL,
  actor_user_id VARCHAR(255),
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(255) NOT NULL,
  entity_id CHAR(36),
  `before` JSON,
  `after` JSON,
  correlation_id VARCHAR(255),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id, created_at)
) ENGINE=InnoDB;

-- Immutability: triggers that reject ANY update/delete, for ANY user (incl. root).
-- Single-statement trigger bodies (no BEGIN/END) so the whole migration file runs as
-- one multi-statement batch. CREATE OR REPLACE keeps this idempotent.
CREATE OR REPLACE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append-only: UPDATE rejected';

CREATE OR REPLACE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append-only: DELETE rejected';
