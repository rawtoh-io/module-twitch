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

  if (!clientId || !clientSecret) {
    throw new Error("RAWTOH_CLIENT_ID and RAWTOH_CLIENT_SECRET are required");
  }

  return { clientId, clientSecret, issuer, redirectUri, scopes, resource };
}

/** Rawtoh API base URL (derived from the issuer: strip /api/auth) */
export function getRawtohApiUrl(): string {
  const { issuer } = getEnv();
  return issuer.replace(/\/api\/auth\/?$/, "");
}

export async function getOIDCConfig(): Promise<oidc.Configuration> {
  if (_config) return _config;

  const { clientId, clientSecret, issuer } = getEnv();

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
