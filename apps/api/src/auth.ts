import * as oidc from "openid-client";

export interface UserInfo {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  email_verified?: boolean;
  organizations?: Array<{
    id: string;
    name: string;
    slug: string;
    logo?: string;
    role: string;
  }>;
}

export interface TokenSet {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

let _config: oidc.Configuration | null = null;

function getEnv() {
  const clientId = process.env.RAWTOH_CLIENT_ID;
  const clientSecret = process.env.RAWTOH_CLIENT_SECRET;
  const issuer = process.env.RAWTOH_ISSUER || "http://localhost:10000/api/auth";
  const redirectUri = process.env.RAWTOH_REDIRECT_URI || "http://localhost:4002/callback";
  const scopes = (process.env.RAWTOH_SCOPES || "openid profile email module:install").split(" ");
  // RFC 8707 resource indicator — required so access tokens are JWTs
  // verifiable by the Rawtoh API (self-service instance provisioning).
  const resource = process.env.RAWTOH_RESOURCE || issuer;

  return { clientId, clientSecret, issuer, redirectUri, scopes, resource };
}

/**
 * How users sign in. `cookie`: this module is served on a subdomain of the
 * hub's COOKIE_DOMAIN and forwards the hub session cookie to `GET /api/me` —
 * no OAuth client at all. `oidc`: self-hosted elsewhere, classic OIDC.
 */
export const authMode: "cookie" | "oidc" = process.env.RAWTOH_CLIENT_ID ? "oidc" : "cookie";

/** Rawtoh API base URL (derived from the issuer: strip /api/auth) */
export function getRawtohApiUrl(): string {
  const { issuer } = getEnv();
  return issuer.replace(/\/api\/auth\/?$/, "");
}

/** Rawtoh hub SPA (sign-in page). Same origin as the API in production. */
export function getRawtohAppUrl(): string {
  return process.env.RAWTOH_APP_URL || getRawtohApiUrl();
}

const APP_URL = process.env.APP_URL || "http://localhost:10601";

// ponytail: per-cookie cache, 30 s; a hub-side revocation lags by that much.
const ME_TTL = 30_000;
const meCache = new Map<string, { user: UserInfo; until: number }>();

/** Cookie SSO: who the forwarded hub session cookie belongs to, or null. */
export async function fetchUserByCookie(cookie: string): Promise<UserInfo | null> {
  const hit = meCache.get(cookie);
  if (hit && hit.until > Date.now()) return hit.user;

  const res = await fetch(`${getRawtohApiUrl()}/api/me`, { headers: { cookie } });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Rawtoh /api/me failed (${res.status})`);

  const me = (await res.json()) as {
    user: { id: string; name: string; email: string; image: string | null };
    organizations: Array<{ id: string; name: string; slug: string; logo: string | null; role: string }>;
  };
  const user: UserInfo = {
    sub: me.user.id,
    name: me.user.name,
    email: me.user.email,
    picture: me.user.image ?? undefined,
    organizations: me.organizations.map(({ logo, ...o }) => ({ ...o, logo: logo ?? undefined })),
  };
  if (meCache.size > 1000) meCache.clear();
  meCache.set(cookie, { user, until: Date.now() + ME_TTL });
  return user;
}

/** Cookie SSO: end the hub session itself — it is the only session there is. */
export async function signOutHub(cookie: string): Promise<void> {
  meCache.delete(cookie);
  // Better-Auth wants an Origin on cookie-bearing POSTs; the hub trusts ours.
  const res = await fetch(`${getRawtohApiUrl()}/api/auth/sign-out`, {
    method: "POST",
    headers: { cookie, origin: APP_URL },
  });
  if (!res.ok && res.status !== 401) throw new Error(`Rawtoh sign-out failed (${res.status})`);
}

export async function getOIDCConfig(): Promise<oidc.Configuration> {
  if (_config) return _config;

  const { clientId, clientSecret, issuer } = getEnv();
  if (!clientId || !clientSecret) {
    throw new Error("RAWTOH_CLIENT_ID and RAWTOH_CLIENT_SECRET are required");
  }

  const options = issuer.startsWith("http://")
    ? { execute: [oidc.allowInsecureRequests] }
    : undefined;

  _config = await oidc.discovery(
    new URL(issuer),
    clientId,
    clientSecret,
    undefined,
    options,
  );

  return _config;
}

export interface AuthRequest {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export async function buildAuthorizeUrl(config: oidc.Configuration): Promise<{ url: URL; auth: AuthRequest }> {
  const { redirectUri, scopes, resource } = getEnv();

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state,
    nonce,
    prompt: "consent",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    resource,
  });

  return { url, auth: { state, nonce, codeVerifier } };
}

export async function exchangeCode(
  config: oidc.Configuration,
  callbackUrl: URL,
  checks: { expectedState: string; expectedNonce: string; pkceCodeVerifier: string },
): Promise<{ tokens: TokenSet; sub: string }> {
  const { resource } = getEnv();
  const result = await oidc.authorizationCodeGrant(config, callbackUrl, {
    expectedState: checks.expectedState,
    expectedNonce: checks.expectedNonce,
    pkceCodeVerifier: checks.pkceCodeVerifier,
  }, {
    resource,
  });

  return {
    tokens: {
      access_token: result.access_token,
      token_type: result.token_type ?? "Bearer",
      expires_in: result.expires_in ?? 3600,
      refresh_token: result.refresh_token ?? undefined,
      id_token: result.id_token ?? undefined,
      scope: result.scope ?? undefined,
    },
    sub: result.claims()?.sub ?? "",
  };
}

export async function refreshAccessToken(config: oidc.Configuration, refreshToken: string): Promise<TokenSet> {
  const { resource } = getEnv();
  const result = await oidc.refreshTokenGrant(config, refreshToken, { resource });

  return {
    access_token: result.access_token,
    token_type: result.token_type ?? "Bearer",
    expires_in: result.expires_in ?? 3600,
    refresh_token: result.refresh_token ?? undefined,
    id_token: result.id_token ?? undefined,
    scope: result.scope ?? undefined,
  };
}

export async function fetchUserInfo(config: oidc.Configuration, accessToken: string, sub: string): Promise<UserInfo> {
  const userinfo = await oidc.fetchUserInfo(config, accessToken, sub);
  return userinfo as unknown as UserInfo;
}
