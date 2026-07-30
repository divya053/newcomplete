-- 0007 — DrawLogix AI copilot chat history. Additive (Law #5), org-scoped.
CREATE TABLE IF NOT EXISTS drawing_messages (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  archived_at DATETIME(3) NULL,
  project_id CHAR(36) NOT NULL,
  role VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (id),
  KEY drawing_messages_org_idx (org_id),
  KEY drawing_messages_project_idx (project_id),
  CONSTRAINT drawing_messages_project_fk FOREIGN KEY (project_id) REFERENCES drawing_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;
