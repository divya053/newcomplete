-- 0003 — tenant-context helper (ws 0.3/0.4), MariaDB port.
--
-- On Postgres this migration created a SECURITY DEFINER function so the app could
-- resolve a user's memberships WITHOUT a tenant context already set — the
-- chicken-and-egg of RLS-scoped multi-tenancy. MariaDB has NO Row-Level Security,
-- so that keyhole is unnecessary: `resolveContext` can read `memberships` directly
-- (isolation is enforced app-side at query time, not by the DB). See
-- apps/web/src/server/context.ts.
--
-- We keep one small, useful artifact: a stored function that surfaces the active
-- tenant set by withTenant(), mirroring Postgres' current_setting('app.current_org').
-- It is informational (MariaDB has no policy to consume it) but documents the seam
-- and is available to future triggers/views.
CREATE OR REPLACE FUNCTION app_current_org() RETURNS CHAR(36)
  NOT DETERMINISTIC NO SQL
  RETURN @app_current_org;
