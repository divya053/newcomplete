-- 0009_host — Preckon Host Console control-plane (backend design §1–§10).
-- ADDITIVE ONLY (Law #5, expand-contract). Extends the existing SaaS tables
-- (orgs = tenant, editions, features, edition_features, org_subscriptions) with the
-- host-spec columns, and adds the pricing / entitlement / billing-mirror /
-- notification / settings / observability tables. MariaDB 10.4 supports
-- `ADD COLUMN IF NOT EXISTS`, so every ALTER is a safe re-run.
--
-- NOTE ON PLANES (CLAUDE.md + spec §0.2): under the "one app, hardened /host area"
-- decision, host staff are members of the host org (orgs.is_host = 1) and host RBAC
-- reuses roles.permissions with the HOST_PERMISSIONS catalog (@ci/shared). So the
-- §1 host_user / host_role tables are NOT recreated — the existing identity tables
-- carry the host plane. Everything else in the spec is realised below.

-- ─────────────────────────────────────────────────────────────────────────────
-- §3 Tenant record — extend `orgs` with the host lifecycle/anchor columns.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255) NULL;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
  -- trial | active | suspended | offboarding | offboarded
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS region VARCHAR(40) NOT NULL DEFAULT 'ca-central';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS primary_contact_email VARCHAR(255) NULL;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS current_edition_id CHAR(36) NULL; -- entitlement anchor (§3.1.1)
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS trial_ends_at DATETIME(3) NULL;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS suspended_at DATETIME(3) NULL;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS suspended_reason TEXT NULL;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS offboarded_at DATETIME(3) NULL;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS entitlement_version BIGINT NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4 Product catalog — extend `features` + `editions` + `edition_features`.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE features ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'module';
  -- module | capability | limit | usage
ALTER TABLE features ADD COLUMN IF NOT EXISTS type VARCHAR(10) NOT NULL DEFAULT 'flag';
  -- flag | limit | metric
ALTER TABLE features ADD COLUMN IF NOT EXISTS value_type VARCHAR(10) NOT NULL DEFAULT 'boolean';
  -- boolean | numeric | enum
ALTER TABLE features ADD COLUMN IF NOT EXISTS unit VARCHAR(40) NULL;
ALTER TABLE features ADD COLUMN IF NOT EXISTS allowed_values JSON NULL;
ALTER TABLE features ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active';
  -- active | beta | deprecated
ALTER TABLE features ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

ALTER TABLE editions ADD COLUMN IF NOT EXISTS `key` VARCHAR(64) NULL;
ALTER TABLE editions ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'published';
  -- draft | published | archived
ALTER TABLE editions ADD COLUMN IF NOT EXISTS is_public TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE editions ADD COLUMN IF NOT EXISTS trial_days INT NOT NULL DEFAULT 14;
ALTER TABLE editions ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

ALTER TABLE edition_features ADD COLUMN IF NOT EXISTS enabled TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE edition_features ADD COLUMN IF NOT EXISTS limit_value DECIMAL(14,2) NULL; -- cap / included quota; NULL = unlimited
ALTER TABLE edition_features ADD COLUMN IF NOT EXISTS enum_value VARCHAR(40) NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- §7 Subscription mirror — extend `org_subscriptions` with billing shape.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS `interval` VARCHAR(10) NOT NULL DEFAULT 'monthly';
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS seats INT NULL;
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS plan_amount_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS usage_mtd_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS current_period_end DATETIME(3) NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- §6 Pricing & packaging.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS currency (
  code CHAR(3) NOT NULL,
  name VARCHAR(60) NOT NULL,
  symbol VARCHAR(8) NOT NULL,
  minor_unit INT NOT NULL DEFAULT 2,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS edition_price (
  edition_id CHAR(36) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  `interval` VARCHAR(10) NOT NULL, -- monthly | annual
  amount_minor BIGINT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (edition_id, currency_code, `interval`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usage_rate (
  feature_id CHAR(36) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  amount_minor BIGINT NOT NULL DEFAULT 0, -- per-unit price
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (feature_id, currency_code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS coupon (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  code VARCHAR(64) NOT NULL,
  name VARCHAR(120) NULL,
  discount_type VARCHAR(10) NOT NULL, -- percent | fixed
  percent_off DECIMAL(5,2) NULL,
  amount_off_minor BIGINT NULL,
  currency_code CHAR(3) NULL,
  duration VARCHAR(12) NOT NULL DEFAULT 'once', -- once | repeating | forever
  duration_months INT NULL,
  max_redemptions INT NULL,
  redeemed_count INT NOT NULL DEFAULT 0,
  valid_until DATETIME(3) NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'active', -- active | disabled | expired
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY coupon_code_uq (code)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────────────────────
-- §5 Entitlement overrides (sparse per-tenant patch over the edition).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_entitlement_override (
  org_id CHAR(36) NOT NULL,
  feature_id CHAR(36) NOT NULL,
  enabled_override TINYINT(1) NULL, -- NULL = inherit
  limit_value_override DECIMAL(14,2) NULL,
  limit_unlimited_override TINYINT(1) NOT NULL DEFAULT 0,
  enum_value_override VARCHAR(40) NULL,
  reason TEXT NOT NULL,
  expires_at DATETIME(3) NULL,
  created_by VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (org_id, feature_id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3.3 Impersonation sessions.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS impersonation_session (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  host_user_id VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active', -- active | ended | expired
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  ended_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY impersonation_org_idx (org_id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────────────────────
-- §7 Billing mirror — invoices + lines (Stripe is source of truth; these mirror).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  number VARCHAR(40) NULL,
  org_id CHAR(36) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(16) NOT NULL DEFAULT 'open', -- draft | open | paid | void | uncollectible
  subtotal_minor BIGINT NOT NULL DEFAULT 0,
  discount_minor BIGINT NOT NULL DEFAULT 0,
  tax_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL DEFAULT 0,
  amount_due_minor BIGINT NOT NULL DEFAULT 0,
  attempt_count INT NOT NULL DEFAULT 0,
  issued_at DATETIME(3) NULL,
  due_date DATETIME(3) NULL,
  paid_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY invoice_org_idx (org_id),
  KEY invoice_status_idx (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoice_line (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  invoice_id CHAR(36) NOT NULL,
  kind VARCHAR(12) NOT NULL, -- plan | usage | proration | one_off | discount | tax
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(14,2) NOT NULL DEFAULT 1,
  unit_amount_minor BIGINT NOT NULL DEFAULT 0,
  amount_minor BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY invoice_line_invoice_idx (invoice_id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────────────────────
-- §8 Notifications — broadcasts (host→tenant) + host inbox (system→staff).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  author_user_id VARCHAR(255) NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  audience_type VARCHAR(16) NOT NULL DEFAULT 'all_tenants', -- all_tenants | by_edition | by_status | specific
  audience_filter JSON NULL,
  deliver_in_app TINYINT(1) NOT NULL DEFAULT 1,
  deliver_email TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'draft', -- draft | sending | sent
  recipients INT NOT NULL DEFAULT 0,
  sent_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY notification_status_idx (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS host_notification (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  kind VARCHAR(12) NOT NULL, -- billing | tenant | security | system
  severity VARCHAR(10) NOT NULL DEFAULT 'info', -- info | warning | critical
  title VARCHAR(200) NOT NULL,
  body TEXT NULL,
  link VARCHAR(255) NULL,
  correlation_id VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS host_notification_read (
  host_notification_id CHAR(36) NOT NULL,
  host_user_id VARCHAR(255) NOT NULL,
  read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (host_notification_id, host_user_id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────────────────────
-- §9 Platform settings — namespaced KV + AI providers/routing + email domains.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_setting (
  `key` VARCHAR(120) NOT NULL,
  value JSON NOT NULL,
  description VARCHAR(255) NULL,
  updated_by VARCHAR(255) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ai_provider (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  `key` VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  kind VARCHAR(12) NOT NULL, -- llm | embedding | reranker
  role VARCHAR(20) NOT NULL DEFAULT 'primary', -- primary | fallback | embeddings
  base_url VARCHAR(255) NULL,
  api_key_secret_ref VARCHAR(255) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'active', -- active | disabled
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY ai_provider_key_uq (`key`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_domain (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  domain VARCHAR(120) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending', -- pending | verified | failed
  dns_records JSON NULL,
  verified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY email_domain_uq (domain)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────────────────────
-- §10 Observability — the one owned table: failed-job diagnostics.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_failure (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  job_id VARCHAR(80) NOT NULL,
  job_type VARCHAR(80) NOT NULL,
  queue VARCHAR(40) NOT NULL DEFAULT 'default',
  org_id CHAR(36) NULL,
  error_class VARCHAR(80) NOT NULL,
  error_message TEXT NOT NULL,
  traceback TEXT NULL,
  attempt INT NOT NULL DEFAULT 0,
  max_attempts INT NULL,
  envelope JSON NULL,
  correlation_id VARCHAR(255) NULL,
  failed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved TINYINT(1) NOT NULL DEFAULT 0,
  resolved_by VARCHAR(255) NULL,
  resolved_at DATETIME(3) NULL,
  resolution_note TEXT NULL,
  PRIMARY KEY (id),
  KEY job_failure_type_idx (job_type),
  KEY job_failure_resolved_idx (resolved)
) ENGINE=InnoDB;
