-- 0005_drawlogix — the DrawLogix module (AI drawing lifecycle). Additive/expand-only
-- (Law #5). Platform conventions: CHAR(36) PKs + org_id on every table (Law #2),
-- DATETIME(3), JSON, soft-archive. ci_app already holds DB-wide DML.

CREATE TABLE IF NOT EXISTS drawing_projects (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  name VARCHAR(255) NOT NULL,
  client VARCHAR(255),
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  PRIMARY KEY (id),
  KEY drawing_projects_org_idx (org_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS drawing_documents (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  project_id CHAR(36) NOT NULL,
  name VARCHAR(500) NOT NULL,
  doc_type VARCHAR(32) NOT NULL DEFAULT 'sow',
  content LONGTEXT,
  file_key VARCHAR(1024),
  status VARCHAR(32) NOT NULL DEFAULT 'received',
  PRIMARY KEY (id),
  KEY drawing_documents_org_idx (org_id),
  KEY drawing_documents_project_idx (project_id),
  CONSTRAINT drawing_documents_project_fk FOREIGN KEY (project_id) REFERENCES drawing_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS drawing_requirements (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  project_id CHAR(36) NOT NULL,
  ref VARCHAR(32) NOT NULL,
  seq INT NOT NULL DEFAULT 0,
  category VARCHAR(32) NOT NULL DEFAULT 'space',
  title VARCHAR(500) NOT NULL,
  detail TEXT,
  source_document_id CHAR(36),
  PRIMARY KEY (id),
  KEY drawing_requirements_org_idx (org_id),
  KEY drawing_requirements_project_idx (project_id),
  CONSTRAINT drawing_requirements_project_fk FOREIGN KEY (project_id) REFERENCES drawing_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS drawings (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  project_id CHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  kind VARCHAR(32) NOT NULL DEFAULT 'concept_plan',
  lifecycle_state VARCHAR(32) NOT NULL DEFAULT 'ai_generated',
  svg LONGTEXT,
  schedule JSON,
  traceability JSON,
  ai_confidence DECIMAL(4,3),
  generation_method VARCHAR(50) DEFAULT 'ai_concept',
  PRIMARY KEY (id),
  KEY drawings_org_idx (org_id),
  KEY drawings_project_idx (project_id),
  CONSTRAINT drawings_project_fk FOREIGN KEY (project_id) REFERENCES drawing_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;
