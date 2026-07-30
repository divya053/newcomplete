import { mysqlTable, text } from "drizzle-orm/mysql-core";
import { baseColumns } from "./_base";
import { json } from "./_types";

/**
 * Per-tenant white-label (ws 0.9). Branding is a TOKEN override, tenant-isolated,
 * and built into the system NOW so it never needs retrofitting. The app reads
 * brandTokens at request time and overrides the CSS variables in @ci/ui.
 */
export const tenantTheme = mysqlTable("tenant_theme", {
  ...baseColumns,
  logoAssetKey: text("logo_asset_key"),
  brandTokens: json<Record<string, string>>("brand_tokens"), // { "--color-primary": "...", ... }
});
