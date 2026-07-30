import { customType } from "drizzle-orm/mysql-core";

/**
 * Portable JSON column for MySQL **and** MariaDB.
 *
 * MariaDB reports `JSON` columns as `LONGTEXT` (JSON is an alias there, not MySQL's
 * native JSON type 245), so the mysql2 driver does NOT auto-parse them and drizzle's
 * built-in `json()` hands back a raw string. Reads then break anything expecting an
 * object/array (e.g. `permissions.filter(...)` in resolveContext). This type makes
 * the round-trip explicit — stringify on write, parse on read — so JSON columns
 * behave the same on both engines. Use this instead of mysql-core's `json`.
 */
export const json = <TData>(name: string) =>
  customType<{ data: TData; driverData: string }>({
    dataType() {
      return "json";
    },
    toDriver(value: TData): string {
      return JSON.stringify(value);
    },
    fromDriver(value: unknown): TData {
      return (typeof value === "string" ? JSON.parse(value) : value) as TData;
    },
  })(name);
