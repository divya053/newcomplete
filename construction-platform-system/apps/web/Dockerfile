# Deploy-stub container for the web runtime (§9 — containerize regardless).
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# Install with the workspace lockfile for reproducible builds.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile

RUN pnpm --filter @ci/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@ci/web", "start"]
