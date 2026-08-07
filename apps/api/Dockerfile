FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY apps/api/src/ apps/api/src/
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/drizzle/ apps/api/drizzle/
COPY apps/api/migrate.ts apps/api/
COPY apps/api/drizzle.config.ts apps/api/

WORKDIR /app/apps/api

CMD ["sh", "-c", "bun run migrate.ts && bun run src/index.ts"]
