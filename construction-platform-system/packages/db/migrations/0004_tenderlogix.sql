-- 0004_tenderlogix — Phase 1 of the TenderLogix module absorb. Ported from the
-- standalone AutoCAD-BOQ-Tender app into the platform's conventions:
--   int PKs -> CHAR(36) UUIDv7   ·   + org_id on EVERY table (tenant isolation,
--   Law #2, incl. the vector table tender_cad_chunks)   ·   timestamptz ->
--   DATETIME(3)   ·   jsonb -> JSON   ·   archived flag -> archived_at soft-delete.
-- Additive/expand-only (Law #5). ci_app already holds DB-wide DML, so new tables
-- are covered without a per-table grant.

CREATE TABLE IF NOT EXISTS tender_projects (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  location VARCHAR(255),
  client VARCHAR(255),
  quotation_ref VARCHAR(255),
  submission_date VARCHAR(100),
  commencement_date VARCHAR(20),
  PRIMARY KEY (id),
  KEY tender_projects_org_idx (org_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tender_documents (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  project_id CHAR(36) NOT NULL,
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  file_size INT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'uploaded',
  extracted_text LONGTEXT,
  cad_extraction_status VARCHAR(32) DEFAULT 'pending',
  PRIMARY KEY (id),
  KEY tender_documents_org_idx (org_id),
  KEY tender_documents_project_idx (project_id),
  CONSTRAINT tender_documents_project_fk FOREIGN KEY (project_id) REFERENCES tender_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tender_sow_sections (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  project_id CHAR(36) NOT NULL,
  seq INT NOT NULL DEFAULT 0,
  sow_ref VARCHAR(64) NOT NULL,
  our_ref VARCHAR(64),
  parent_sow_ref VARCHAR(64),
  title VARCHAR(500) NOT NULL,
  measurement_basis VARCHAR(200),
  scope_notes TEXT,
  PRIMARY KEY (id),
  KEY tender_sow_sections_org_idx (org_id),
  KEY tender_sow_sections_project_idx (project_id),
  CONSTRAINT tender_sow_sections_project_fk FOREIGN KEY (project_id) REFERENCES tender_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tender_cad_extractions (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  document_id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  summary JSON,
  error_message TEXT,
  layer_count INT,
  block_definition_count INT,
  block_instance_total INT,
  text_annotation_count INT,
  schedule_count INT,
  chunk_count INT,
  PRIMARY KEY (id),
  KEY tender_cad_extractions_org_idx (org_id),
  KEY tender_cad_extractions_project_idx (project_id),
  CONSTRAINT tender_cad_extractions_document_fk FOREIGN KEY (document_id) REFERENCES tender_documents(id) ON DELETE CASCADE,
  CONSTRAINT tender_cad_extractions_project_fk FOREIGN KEY (project_id) REFERENCES tender_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tender_cad_chunks (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  extraction_id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  chunk_type VARCHAR(32) NOT NULL,
  source_document_type VARCHAR(32),
  section VARCHAR(500),
  page INT,
  layer VARCHAR(255),
  block_name VARCHAR(255),
  sheet VARCHAR(255),
  ref_id VARCHAR(255),
  text LONGTEXT NOT NULL,
  embedding JSON,
  embedding_model VARCHAR(64),
  PRIMARY KEY (id),
  KEY tender_cad_chunks_org_idx (org_id),
  KEY tender_cad_chunks_project_idx (project_id),
  KEY tender_cad_chunks_extraction_idx (extraction_id),
  CONSTRAINT tender_cad_chunks_extraction_fk FOREIGN KEY (extraction_id) REFERENCES tender_cad_extractions(id) ON DELETE CASCADE,
  CONSTRAINT tender_cad_chunks_document_fk FOREIGN KEY (document_id) REFERENCES tender_documents(id) ON DELETE CASCADE,
  CONSTRAINT tender_cad_chunks_project_fk FOREIGN KEY (project_id) REFERENCES tender_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tender_boq_items (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  project_id CHAR(36) NOT NULL,
  category VARCHAR(100) NOT NULL,
  item_code VARCHAR(100),
  description TEXT NOT NULL,
  unit VARCHAR(50) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2),
  total_price DECIMAL(14,2),
  notes TEXT,
  ai_confidence DECIMAL(4,3),
  lifecycle_state VARCHAR(32) NOT NULL DEFAULT 'ai_generated',
  verification_status VARCHAR(50) DEFAULT 'unverified',
  verification_notes TEXT,
  approval_status VARCHAR(20) DEFAULT 'pending',
  generation_method VARCHAR(50) DEFAULT 'single',
  sow_ref VARCHAR(32),
  our_ref VARCHAR(32),
  sub_ref VARCHAR(32),
  sr_no VARCHAR(32),
  remarks TEXT,
  drawing_references JSON,
  PRIMARY KEY (id),
  KEY tender_boq_items_org_idx (org_id),
  KEY tender_boq_items_project_idx (project_id),
  CONSTRAINT tender_boq_items_project_fk FOREIGN KEY (project_id) REFERENCES tender_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;
