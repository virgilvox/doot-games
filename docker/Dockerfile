# Doot — production image. Multi-stage: build the Nuxt app, then run the Nitro
# server output on a slim Node image. The same image runs locally and on a
# droplet; only environment variables differ.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

# Install deps with the lockfile for reproducible builds. tsconfig.base.json is
# extended by every package's tsconfig, so the build needs it at the root.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

# Build the web app (engine/sdk/ui/themes/games are transpiled by Nuxt).
RUN pnpm --filter @doot-games/web build

# Stage libSQL's prebuilt native addon. Nitro bundles its JS wrapper but not the
# platform binary; copy it into the server output in the run stage below.
RUN set -eux; \
    NATIVE="$(find /app/node_modules/.pnpm -type d -path '*@libsql+linux-x64-musl*/node_modules/@libsql/linux-x64-musl' | head -1)"; \
    test -n "$NATIVE"; \
    mkdir -p /tmp/libsql-native; \
    cp -a "$NATIVE/." /tmp/libsql-native/

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY --from=build /app/apps/web/.output ./.output
# Drop in libSQL's native addon where the bundled server resolves it.
COPY --from=build /tmp/libsql-native ./.output/server/node_modules/@libsql/linux-x64-musl
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
