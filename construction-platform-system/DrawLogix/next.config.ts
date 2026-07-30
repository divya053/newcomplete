import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // This app lives next to a pnpm workspace; pin its own root so Next doesn't infer
  // the parent lockfile as the tracing root.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  experimental: {
    // Bulk document uploads (many large PDFs) — allow a big server-action body.
    serverActions: { bodySizeLimit: "100mb" },
  },
};

export default config;
