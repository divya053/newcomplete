import { defineConfig } from "drizzle-kit";

// Drizzle is the schema source of truth. We hand-author the audit-immutability SQL
// in migrations/ (drizzle-kit doesn't model triggers/grants), but generate table DDL
// from the schema. Expand-contract only (guardrail #5) — CI rejects destructive ops.
//
// NOTE (MariaDB/XAMPP port): the engine is MariaDB 10.4 (MySQL dialect). MariaDB has
// no Row-Level Security, so tenant isolation is enforced in the scoped repository
// (app layer), not the DB. See packages/db/src/scoped.ts for the full rationale.
export default defineConfig({
  dialect: "mysql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "mysql://root@localhost:3306/construction_intelligence",
  },
});
