# Build context is the repo root (not apps/web) — see docker-compose.yml.
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

FROM base AS build
WORKDIR /app

# package.json-only stubs for the workspace members web doesn't need source for
# (see apps/api/Dockerfile's comment — --frozen-lockfile needs the whole graph).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/types packages/types
COPY packages/core packages/core
COPY packages/api-client packages/api-client
COPY packages/ui-tokens packages/ui-tokens
COPY apps/web apps/web
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json

RUN pnpm install --filter @travel/web... --frozen-lockfile
RUN pnpm --filter @travel/types build
RUN pnpm --filter @travel/core build
RUN pnpm --filter @travel/api-client build
RUN pnpm --filter @travel/ui-tokens build
RUN pnpm rebuild sharp

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not read at
# runtime — must be an ARG/ENV here so the CI workflow's --build-arg actually
# reaches `next build`, not just passed to `docker run` where it'd do nothing.
ARG NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
# next.config.mjs's rewrites() is evaluated once at build time into a static
# routes manifest, not re-evaluated per request — so API_URL must be baked in
# here too, or the manifest freezes on its localhost:3008 fallback regardless
# of what's set on the running container (Trakt precedent: apps/web/Dockerfile).
ARG API_URL=http://travel-api:3008
ENV API_URL=$API_URL
RUN pnpm --filter @travel/web build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Next's standalone output doesn't include public/ or .next/static — copy them manually.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
