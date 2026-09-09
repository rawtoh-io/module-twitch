# Module Twitch

Multi-tenant Twitch integration module with OAuth dual-login (Rawtoh + Twitch), 60+ JSON-RPC 2.0 methods for chat/moderation/channel management, real-time EventSub streaming, and WebSocket connection management.

## Stack

| Layer | Choice |
|-------|--------|
| API runtime | Bun |
| API framework | Hono |
| Database | PostgreSQL + Drizzle ORM |
| Frontend | React 19 + Vite 7 |
| Routing | TanStack Router (file-based) |
| Server state | TanStack React Query |
| Twitch API | Twurple (auth, api, chat, eventsub-ws) |
| External real-time | WebSocket JSON-RPC 2.0 |
| Auth | `@rawtoh/module-sdk` (`/hono`): cookie SSO by default (hub session cookie forwarded to `GET /api/me`, no OAuth client); OIDC (openid-client) when `RAWTOH_CLIENT_ID` is set. Hono sessions (server-side storage in `session` table) carry OIDC tokens / OAuth state |
| Self-service install | User hub credentials (forwarded cookie, or OIDC token with scope `module:install`) → module provisions one Rawtoh instance per Twitch account (`POST /api/orgs/:orgId/accounts/:accountId/install`) |
| Module ↔ hub auth | Ed25519 key pair per Twitch account, generated locally at enrollment; `session.challenge` nonce signed and returned in `session.register` |
| Monorepo | Turbo + Bun workspaces |
| Linter / Formatter | Biome |
| UI | Radix + Tailwind + shadcn |

## Structure

```
module-twitch/
├── apps/
│   ├── api/                     # Hono backend (Bun runtime)
│   │   └── src/
│   │       ├── index.ts         # Hono app, middleware, route mounting
│   │       ├── api.ts           # TwitchApi class (Twurple API wrapper)
│   │       ├── twitch.ts        # TwitchClient (chat + EventSub management)
│   │       ├── rpc.ts           # JSON-RPC 2.0 method registration
│   │       ├── connections.ts   # Account connection management + reconnect
│   │       ├── session-storage.ts # @hono/session PostgreSQL storage (cookie carries sid only)
│   │       ├── db/
│   │       │   └── index.ts     # CRUD query functions
│   │       ├── middleware/
│   │       │   └── auth.ts      # SessionData/AuthEnv + requireAuth/resolveOrg bound from @rawtoh/module-sdk
│   │       ├── routes/
│   │       │   ├── auth.ts      # authRoutes() from the SDK + Twitch OAuth connect/callback
│   │       │   └── accounts.ts  # Twitch account CRUD, self-service install, credentials, connection
│   │       └── templates/       # HTML templates (legacy SSR)
│   │
│   └── web/                     # React 19 + Vite frontend
│       └── src/
│           ├── main.tsx         # Render, QueryClient, AuthProvider, Router
│           ├── api/client.ts    # Ky HTTP client
│           ├── hooks/           # use-auth, use-accounts
│           ├── components/      # Login, theme-provider
│           ├── components/ui/   # UI primitives (shadcn/Radix + Tailwind)
│           └── routes/          # File-based routing (TanStack)
│               ├── index.tsx                    # Organizations list
│               └── admin/o/$orgSlug/index.tsx   # Twitch account management
│
├── packages/
│   └── shared/                  # Drizzle schema + types, shared across API/Web
│       └── src/
│           ├── db/
│           │   └── schema.ts    # Drizzle table definitions (config)
│           └── types/
│               └── index.ts     # Event payload types
│
├── Caddyfile                  # Standalone entry point (imports caddy/module-twitch.caddy)
├── caddy/module-twitch.caddy  # Caddy site block (SPA reverse-proxied to the nginx container)
├── deploy/k8s/                # k3s manifests (kustomize, $DOMAIN templated via envsubst)
├── docker-compose.yml         # Production stack (base)
├── docker-compose.caddy.yml   # Standalone override (adds Caddy, TLS)
├── docker-compose.proxy.yml   # External reverse proxy override (PROXY_NETWORK)
└── .github/workflows/         # CI: build images → GHCR, deploy to k3s (kubectl)
```

## Code standards

### Style (Biome)

- **Indentation**: tabs
- **Quotes**: double quotes (`"`)
- **Semicolons**: yes
- **Imports**: auto-organized by Biome

### Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `use-auth.tsx`, `use-accounts.ts` |
| Variables, functions | camelCase | `orgId`, `listConfigs`, `reconnectAccount` |
| Types, components | PascalCase | `Config`, `TwitchClient`, `WsClient` |
| Hooks | `use` + camelCase | `useAuth`, `useAccounts`, `useInstallAccount` |
| SQL tables | snake_case | `account` |
| SQL columns | snake_case | `org_id`, `twitch_user_id`, `access_token` |
| API routes | kebab-case | `/api/orgs/:orgId/accounts/:accountId` |
| Env vars | SCREAMING_SNAKE_CASE | `DATABASE_URL`, `TWITCH_CLIENT_ID` |

### TypeScript

- `strict: true` everywhere
- `const` by default, `let` only when reassignment is needed
- `type` keyword for type-only imports
- Early returns for guards/validation
- Nullish coalescing (`??`) and optional chaining (`?.`)

## Patterns

### Database (Drizzle)

```typescript
// Schema: apps/api/src/db/schema.ts
export const config = pgTable("config", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  clientId: text("client_id"),        // OAuth2 client credentials of the
  clientSecret: text("client_secret"), // Rawtoh module instance (per account)
  twitchUserId: text("twitch_user_id").notNull(),
  twitchLogin: text("twitch_login").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  // ...
});

// Queries: apps/api/src/db/index.ts
export async function listConfigs(orgId: string): Promise<Config[]> {
  return db.select().from(config).where(eq(config.orgId, orgId));
}
```

Migrations auto-generated by `drizzle-kit generate` in `/drizzle/`.

### API routes (Hono)

Each route file exports a Hono instance mounted in `index.ts`:

```typescript
const accounts = new Hono<AuthEnv>();
accounts.get("/api/orgs/:orgId/accounts", requireAuth, resolveOrg("owner"), async (c) => { ... });
accounts.delete("/api/orgs/:orgId/accounts/:accountId", requireAuth, resolveOrg("owner"), async (c) => { ... });
export default accounts;
```

- `resolveOrg("owner")`: owner-only access (most account operations)
- Validation via Zod `safeParse()`

### JSON-RPC 2.0 (WebSocket)

Methods registered in `rpc.ts`, organized by domain:

```typescript
server.addMethod("chat.say", async (params) => { ... });
server.addMethod("channel.get_info", async () => { ... });
server.addMethod("moderation.ban", async (params) => { ... });
server.addMethod("event.subscribe", async (params) => { ... });
```

Events emitted via notifications to connected clients:

```typescript
wsClient.notify("chat.message", { username, message, ... });
wsClient.notify("eventsub.stream_online", { broadcasterId, ... });
```

### Frontend hooks (React Query)

All `useQuery`, `useMutation` and `useQueryClient` calls must live in `hooks/` files. Components and routes never import directly from `@tanstack/react-query` (except `main.tsx` for the `QueryClientProvider`).

```typescript
// hooks/use-accounts.ts
export function useAccounts() {
  const org = useOrg();
  return useQuery({
    queryKey: ["accounts", org.id],
    queryFn: () => query.get(`api/orgs/${org.id}/accounts`).json<Config[]>(),
  });
}
```

### Real-time

- **WebSocket** (Rawtoh hub): JSON-RPC 2.0, methods registered in `rpc.ts`, auto-reconnect with exponential backoff (1s to 64s), ping every 10s
- **Twitch Chat** (Twurple ChatClient): events registered in `twitch.ts`, forwarded as RPC notifications
- **Twitch EventSub** (Twurple EventSubWsListener): dynamic subscriptions via `event.subscribe()`, forwarded as RPC notifications

### Connection management

```typescript
// connections.ts
// One WS connection per enrolled Twitch account
// session.challenge({ instance_id }) → nonce, signed with the account's Ed25519
// private key → session.register({ instance_id, signature }); both within the hub's 5s window
// Auto-reconnect loop with exponential backoff (1s → 64s)
// Close codes 4000 (disconnect requested) / 4001 (key rotated) → do NOT reconnect;
// reason tracked via getDisconnectReason() and surfaced in the UI over the SSE status stream
```

### Auth flow

1. **User login**: cookie SSO — the hub session cookie (`COOKIE_DOMAIN`) is forwarded to `GET /api/me` on every request (30 s cache); or Rawtoh OIDC (PKCE + RFC 8707 `resource`, scope `module:install`) when `RAWTOH_CLIENT_ID` is set → session cookie (sid only, data in `session` table)
2. **Twitch connect**: Twitch OAuth → tokens stored in `account` table
3. **Self-service install**: `POST /api/orgs/:orgId/accounts/:accountId/install` uses the user's hub credentials (cookie or OIDC token) to provision one Rawtoh module instance per Twitch account (name = twitch login) → the returned enrollment token is redeemed immediately, storing `instanceId`/`privateKey`/`rpcUrl` on the account row
4. **WebSocket register**: sign the hub's `session.challenge` nonce with the account's private key → `session.register` on Rawtoh hub → RPC methods available

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Start API + Web in dev mode
bun run dev:api      # Start API only
bun run dev:web      # Start Web only
bun run build        # Production build
bun run typecheck    # TypeScript check
bun run lint         # Biome lint
bun run format       # Biome format
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Run migrations
bun run db:push      # Push schema to DB
bun run db:studio    # Drizzle Studio UI
```

## Local dev

Docker Compose provides PostgreSQL:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Environment variables in `.env` at the root:

- `RAWTOH_ISSUER`, `RAWTOH_APP_URL` — Rawtoh hub; `RAWTOH_CLIENT_ID`, `RAWTOH_CLIENT_SECRET` only for OIDC
- `RAWTOH_SCOPES` — must include `module:install` for self-service install (`openid profile email module:install`)
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` — Twitch app credentials
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Session encryption (64+ chars)
- `RAWTOH_WS_URL` — WebSocket hub URL

## Deployment

Step-by-step setup: **[DEPLOYMENT.md](DEPLOYMENT.md)** (DNS, GitHub secrets/variables, cluster secrets, first deploy).

The SPA is a self-contained `nginx:alpine` image (build copied in, SPA fallback + CSP in `apps/web/nginx/`), reverse-proxied with the API by the layer in front. Images are built by GitHub Actions → `ghcr.io/rawtoh-io/module-twitch-<api|web>:production` (+ `:production-<sha7>`; pin `IMAGE_TAG` to roll back).

**Production (rawtoh.io): k3s** — kustomize manifests in `deploy/k8s/`, deployed into the shared `rawtoh` namespace of the main cluster. CI applies them on push to `main` (`kubectl kustomize deploy/k8s | envsubst '$DOMAIN' | kubectl apply -f -` + rollout restart of changed deployments; secrets: `KUBE_CONFIG`, variable: `DOMAIN`). TLS via the cluster's `letsencrypt-prod` ClusterIssuer, security headers via the shared `rawtoh-security-headers@kubernetescrd` Traefik middleware (CSP is set by the web nginx). Secrets (`twitch-secrets`) are created once manually from `deploy/k8s/bootstrap/secrets.example.yaml`. The module reaches the platform in-cluster: `ws://rpc:10006` (WS hub), `postgres` via its own `twitch-postgres` pod.

**Self-hosting (Docker Compose):**

- `docker-compose.yml` — base production stack: `twitch-postgres`, `twitch-api` (:10600), `twitch-web` (nginx :80)
- `caddy/module-twitch.caddy` — the Caddy site block (`twitch.<DOMAIN>`): proxied paths, SPA proxying. Single source reused by both modes
- `Caddyfile` — standalone entry point: global options + `import /etc/caddy/module-twitch.caddy`
- `docker-compose.caddy.yml` — standalone override: adds the `caddy` service (ports 80/443, env `DOMAIN` + `ACME_EMAIL`)
- `docker-compose.proxy.yml` — external-proxy override: joins an existing Docker network (`PROXY_NETWORK` in `.env`) so your own reverse proxy can reach `twitch-api:10600` and `twitch-web:80`. With Caddy in front: drop `caddy/module-twitch.caddy` into a directory imported by your main Caddyfile, then `caddy reload`

```bash
# Standalone (own server)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d

# Behind your own reverse proxy
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d
```

Required `.env` (compose production): `PUBLIC_DOMAIN`, `POSTGRES_PASSWORD`, `SESSION_SECRET`, `RAWTOH_ISSUER` (+ `RAWTOH_CLIENT_ID`/`RAWTOH_CLIENT_SECRET` for OIDC off the hub domain), `RAWTOH_WS_URL`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (+ `ACME_EMAIL` standalone, `PROXY_NETWORK` external-proxy).
