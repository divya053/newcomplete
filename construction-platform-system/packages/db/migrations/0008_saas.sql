-- 0008_saas — multi-tenant SaaS layer: features, editions (plans), edition→feature
-- bundles, per-tenant subscriptions, and a host flag on orgs. Additive (Law #5).
-- features/editions are GLOBAL (host-managed, no org_id).

CREATE TABLE IF NOT EXISTS features (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  `key` VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY features_key_uq (`key`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS editions (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  name VARCHAR(120) NOT NULL,
  description TEXT,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS edition_features (
  edition_id CHAR(36) NOT NULL,
  feature_id CHAR(36) NOT NULL,
  PRIMARY KEY (edition_id, feature_id),
  CONSTRAINT edition_features_edition_fk FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE,
  CONSTRAINT edition_features_feature_fk FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS org_subscriptions (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  edition_id CHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY org_subscriptions_org_idx (org_id),
  CONSTRAINT org_subscriptions_org_fk FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
  CONSTRAINT org_subscriptions_edition_fk FOREIGN KEY (edition_id) REFERENCES editions(id)
) ENGINE=InnoDB;

ALTER TABLE orgs ADD COLUMN is_host TINYINT(1) NOT NULL DEFAULT 0;
