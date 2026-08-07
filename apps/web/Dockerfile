FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
RUN bun run --filter web build

# ── Static files ────────────────────────────────────────────────
# Self-contained image: nginx serves the SPA directly (k8s Deployment
# behind an Ingress, or reverse-proxied by Caddy in standalone mode).
FROM nginx:alpine AS production
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist/ /usr/share/nginx/html/
