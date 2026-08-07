# Deployment

Module Twitch deploys into the **shared rawtoh k3s cluster** (namespace `rawtoh`) — no change to the main `rawtoh-io/app` repo is required. Routing via Traefik, TLS via cert-manager. Deploys are automatic on push to `main`.

**Prerequisite:** the main cluster is up — see `DEPLOYMENT.md` in `rawtoh-io/app` (cert-manager issuer `letsencrypt-prod` and Traefik middleware `rawtoh-security-headers` must exist).

## Instructions

One-time setup, in order. Examples assume domain `rawtoh.io` — replace with yours.

### 1. DNS record

**Where:** your DNS provider.

**Example:** `twitch.rawtoh.io  A  203.0.113.10` (same VPS IP as the main platform).

### 2. GitHub secret `KUBE_CONFIG`

**What:** the kubeconfig of the rawtoh cluster (the exact same value as in the main repo).

**Where:** this repo → _Settings → Secrets and variables → Actions → Secrets_.

### 3. GitHub variable `DOMAIN`

**Where:** this repo → _Settings → Secrets and variables → Actions → Variables_.

**Example:** `rawtoh.io`

### 4. Twitch application

**Where:** [dev.twitch.tv/console](https://dev.twitch.tv/console) → your app.

Set the OAuth redirect URL to `https://twitch.rawtoh.io/callback/twitch` and note the Client ID / Client Secret for the next step.

### 5. Cluster secret `twitch-secrets`

**Where:** copy `deploy/k8s/bootstrap/secrets.example.yaml` → `deploy/k8s/bootstrap/secrets.yaml` (gitignored), fill it in, then `kubectl apply -f deploy/k8s/bootstrap/secrets.yaml`.

**Example:**

```yaml
stringData:
  POSTGRES_PASSWORD: W6mR2kX9vN4pL8sQ
  DATABASE_URL: postgres://rawtoh:W6mR2kX9vN4pL8sQ@twitch-postgres:5432/twitch
  SESSION_SECRET: h4Jk8M2nB6vC9xZ3qW7eR5tY1uI0oP4a   # openssl rand -base64 32
  # Encrypts the Ed25519 private keys at rest. Distinct from SESSION_SECRET:
  # rotating the session secret only logs users out, rotating this one makes
  # every stored identity undecryptable and forces a re-enrollment per account.
  ENCRYPTION_KEY: 7pQ4mB9xK2vL6nR3sT8wY1cF5hJ0dG7zA4eU2iO9kM=  # openssl rand -base64 32
  # From the module instance registered on the Rawtoh platform
  # (shown once at creation):
  RAWTOH_CLIENT_ID: rth_c_3a7b1d9e5f2c...
  RAWTOH_CLIENT_SECRET: rth_s_2m8k4x7v1n9p...
  # From step 4:
  TWITCH_CLIENT_ID: gp762nuuo6oxfpw8v8k2saa3mtk9z1
  TWITCH_CLIENT_SECRET: k9x2m4v7n1p8q3w6e5r0t2y4u6i8o1
```

### 6. Non-secret config

**Where:** `deploy/k8s/configmap.yaml` — committed in git. Nothing to edit: `$DOMAIN` is substituted at apply time (`TWITCH_REDIRECT_URI` is derived automatically).

### 7. Deploy

Push to `main` (CI does everything), or manually:

```sh
export DOMAIN=rawtoh.io
kubectl kustomize deploy/k8s | envsubst '$DOMAIN' | kubectl apply -f -
kubectl -n rawtoh rollout status deployment/twitch-api
kubectl -n rawtoh rollout status deployment/twitch-web
```

### 8. Verify

```sh
kubectl -n rawtoh get certificate twitch-tls   # Ready=True (a minute or two)
curl -I https://twitch.rawtoh.io               # 200 + security headers
```

## Operations

```sh
kubectl -n rawtoh logs -f deployment/twitch-api
# Rollback (sha7 tags are kept on GHCR):
kubectl -n rawtoh set image deployment/twitch-api api=ghcr.io/rawtoh-io/module-twitch-api:production-<sha7>
```

## Self-hosting without k3s

Docker Compose standalone / external-proxy modes still work — see `README.md` and `.env.example`.
