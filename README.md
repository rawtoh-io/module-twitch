# module-twitch

Module Rawtoh pour l'integration Twitch. Fournit une interface web (Hono) pour connecter des comptes Twitch via OAuth, et expose l'API Twitch via JSON-RPC 2.0 sur WebSocket.

## Stack

- **Runtime** : Bun
- **Framework web** : Hono
- **Base de donnees** : PostgreSQL (Drizzle ORM)
- **Twitch** : Twurple (auth, chat, API, EventSub)
- **Communication** : JSON-RPC 2.0 sur WebSocket (json-rpc-2.0 + ws)

## Fonctionnalites

- Authentification par SSO cookie Rawtoh (sous-domaine du hub), ou OIDC en auto-hébergé
- Connexion de comptes Twitch par organisation (OAuth Twitch)
- Installation self-service : provisionnement automatique d'une instance Rawtoh par compte Twitch (credentials OAuth2 `client_id`/`client_secret`)
- Connexion WebSocket au hub Rawtoh avec reconnexion automatique (signature Ed25519 d'un nonce)
- API RPC exposant les actions Twitch : chat, moderation, polls, predictions, raids, clips, channel points, whispers, subscriptions, bits, search
- Reception d'evenements Twitch en temps reel (chat + EventSub)

## Variables d'environnement

| Variable | Description | Defaut |
|---|---|---|
| `SESSION_SECRET` | Secret pour les sessions | requis |
| `DATABASE_URL` | URL de connexion PostgreSQL | `postgres://rawtoh:rawtoh@localhost:10602/twitch` |
| `RAWTOH_APP_URL` | URL du hub Rawtoh (page de connexion) | origine de `RAWTOH_ISSUER` |
| `RAWTOH_CLIENT_ID` | Client ID OAuth Rawtoh — uniquement en auto-hébergé hors du domaine du hub (active OIDC) | — |
| `RAWTOH_CLIENT_SECRET` | Client Secret OAuth Rawtoh (idem) | — |
| `RAWTOH_ISSUER` | URL de l'issuer Rawtoh | requis |
| `RAWTOH_REDIRECT_URI` | URI de callback OAuth Rawtoh (mode OIDC) | — |
| `RAWTOH_SCOPES` | Scopes OAuth Rawtoh | `openid profile email module:install` |
| `RAWTOH_WS_URL` | URL WebSocket du hub Rawtoh | `ws://127.0.0.1:10006` |
| `TWITCH_CLIENT_ID` | Client ID de l'app Twitch | requis |
| `TWITCH_CLIENT_SECRET` | Client Secret de l'app Twitch | requis |
| `TWITCH_REDIRECT_URI` | URI de callback OAuth Twitch | `http://localhost:10600/callback/twitch` |
| `TWITCH_SCOPES` | Scopes OAuth Twitch (espace-separes) | liste par defaut dans le code |

## Developpement

```bash
cp .env.example .env
# Editer .env avec vos valeurs

bun install
bun run db:generate   # Generer les migrations
bun run db:migrate    # Appliquer les migrations
bun run dev           # Lancer en mode watch
```

## Deploiement Docker

Le front est une image nginx autonome (build statique Vite servi sur :80) ; l'API est reverse-proxifee.
Les images sont buildees par la CI GitHub et tirees depuis GHCR (ajouter `--build` pour builder localement).

```bash
# Serveur dedie (Caddy inclus, TLS automatique)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d

# Derriere votre propre reverse proxy (Caddy, Traefik, ...)
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d
# -> definir PROXY_NETWORK dans .env, voir docker-compose.proxy.yml
# -> avec Caddy : copier caddy/module-twitch.caddy dans un dossier importe
#    par votre Caddyfile principal (import /etc/caddy/sites/*.caddy), puis reload
```

Variables requises dans `.env` : voir la section Production de `.env.example`.
Le Dockerfile execute automatiquement les migrations au demarrage (`bun run migrate.ts`).

## Deploiement k3s (production rawtoh.io)

Voir **[DEPLOYMENT.md](DEPLOYMENT.md)** pour les instructions completes (DNS, secrets, CI).

Le module se deploie dans le cluster k3s partage (namespace `rawtoh`) — manifests kustomize dans `deploy/k8s/` :

```bash
export DOMAIN=rawtoh.io
kubectl kustomize deploy/k8s | envsubst '$DOMAIN' | kubectl apply -f -
```

Secrets crees une fois manuellement (`deploy/k8s/bootstrap/secrets.example.yaml`). La CI deploie automatiquement sur push `main` (secret `KUBE_CONFIG`, variable `DOMAIN`). TLS via le ClusterIssuer `letsencrypt-prod` du cluster, headers de securite via le middleware Traefik partage `rawtoh-security-headers@kubernetescrd`.

## Methodes RPC

Le module expose les methodes suivantes via JSON-RPC 2.0 :

### Chat
- `chat.say` - Envoyer un message
- `chat.action` - Envoyer un /me
- `chat.get_chatters` - Lister les viewers
- `chat.send_announcement` - Envoyer une annonce
- `chat.shoutout` - Shoutout un utilisateur

### Channel
- `channel.get_info` - Infos de la chaine
- `channel.update` - Modifier titre/jeu/langue/tags
- `channel.get_follower_count` - Nombre de followers
- `channel.start_commercial` - Lancer une pub

### Stream
- `stream.get_by_user_id` / `stream.get_by_user_name` - Infos du stream
- `stream.create_marker` - Creer un marqueur

### Users
- `user.get_by_id` / `user.get_by_name` - Infos utilisateur

### Games
- `game.get_by_name` / `game.get_by_id` / `game.get_top` - Recherche de jeux

### Moderation
- `moderation.ban` / `moderation.timeout` / `moderation.unban`
- `moderation.get_moderators` / `moderation.get_banned`
- `moderation.add_moderator` / `moderation.remove_moderator`
- `moderation.delete_messages`
- `moderation.shield_mode_status` / `moderation.update_shield_mode`

### Polls & Predictions
- `polls.create` / `polls.end`
- `predictions.create` / `predictions.lock` / `predictions.resolve` / `predictions.cancel`

### Raids
- `raids.start` / `raids.cancel`

### Clips
- `clips.create` / `clips.get`

### Whispers
- `whispers.send`

### Channel Points
- `channel_points.get_rewards` / `channel_points.create_reward`

### VIPs
- `vips.get` / `vips.add` / `vips.remove`

### Subscriptions & Bits
- `subscriptions.get_count`
- `bits.get_leaderboard`

### Evenements (event.subscribe)
- `chat.message`, `chat.sub`, `chat.resub`, `chat.raid`, `chat.ban`, `chat.whisper`, ...
- `eventsub.stream_online`, `eventsub.stream_offline`, `eventsub.channel_update`, `eventsub.channel_follow`, ...


```bash
docker compose -f docker-compose.dev.yml up -d
```