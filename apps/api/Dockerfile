# Build context is the repo root (not apps/api) — see docker-compose.yml.
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

FROM base AS build
WORKDIR /app

# pnpm-lock.yaml describes the WHOLE workspace graph, so every workspace member
# needs at least its package.json present or `--frozen-lockfile` fails workspace
# resolution — copy package.json-only stubs for siblings apps/api doesn't need
# source for, full source only for what it actually depends on.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY packages/types packages/types
COPY packages/core packages/core
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/ui-tokens/package.json packages/ui-tokens/package.json
COPY apps/api apps/api
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json

# packages/types and packages/core must be compiled to dist/ before apps/api's
# own build — a plain `node dist/server.js` cannot resolve raw .ts files from a
# workspace package (see build plan §1 for the bug this fixes).
RUN pnpm install --filter @travel/api... --frozen-lockfile
RUN pnpm --filter @travel/types build
RUN pnpm --filter @travel/core build
RUN pnpm --filter @travel/api build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/migrations ./apps/api/migrations

WORKDIR /app/apps/api
RUN mkdir -p uploads
EXPOSE 3008
CMD ["node", "dist/server.js"]
