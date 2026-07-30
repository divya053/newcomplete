import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are TS source — let Next transpile them.
  transpilePackages: ["@ci/ui", "@ci/shared", "@ci/db"],
  experimental: {
    // Server Actions are the default application (BFF) entrypoint. Bumped so
    // document uploads (SOW PDFs etc.) can be sent through a server action.
    serverActions: { bodySizeLimit: "25mb" },
  },
  // Preckon marketing site — static passthrough. The pages live verbatim under
  // public/site/ and cross-link by relative .html filename; this rewrite gives
  // the bare /site path a homepage without touching the HTML. App routes unaffected.
  async rewrites() {
    return [
      { source: "/site", destination: "/site/index.html" },
      { source: "/site/", destination: "/site/index.html" },
    ];
  },
};

export default config;
