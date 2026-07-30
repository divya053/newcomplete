-- Runs once on first MariaDB boot (docker-entrypoint-initdb.d) for the DOCKER path.
-- (For XAMPP, `pnpm db:setup` does the equivalent against your running server.)
--
-- Creates the least-privilege application user the app connects as. It has DML but
-- never DDL, so it cannot ALTER away the audit-immutability triggers. MariaDB has no
-- Row-Level Security, so this user is defense-in-depth, NOT the tenant boundary —
-- tenant isolation is enforced in the app's scoped repository (guardrail #2; see
-- packages/db/src/scoped.ts).
CREATE USER IF NOT EXISTS 'ci_app'@'%' IDENTIFIED BY 'ci_app_local_dev';
GRANT SELECT, INSERT, UPDATE, DELETE ON construction_intelligence.* TO 'ci_app'@'%';
FLUSH PRIVILEGES;
