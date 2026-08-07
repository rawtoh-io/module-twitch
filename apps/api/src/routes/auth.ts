import { Hono } from "hono";
import { exchangeCode as exchangeTwitchCode } from "@twurple/auth";
import {
  getOIDCConfig,
  buildAuthorizeUrl,
  exchangeCode,
  fetchUserInfo,
} from "../auth";
import type { AuthEnv } from "../middleware/auth";

const APP_URL = process.env.APP_URL || "/";
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
const TWITCH_REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || "http://localhost:10600/callback/twitch";
const TWITCH_SCOPES = (process.env.TWITCH_SCOPES || [
  "chat:read", "chat:edit",
  "channel:read:subscriptions",
  "channel:manage:broadcast",
  "channel:manage:polls",
  "channel:manage:predictions",
  "channel:manage:raids",
  "channel:edit:commercial",
  "moderator:manage:banned_users",
  "moderator:read:chatters",
  "moderator:manage:chat_messages",
  "moderator:manage:announcements",
  "moderator:manage:shoutouts",
  "moderator:read:shield_mode",
  "moderator:manage:shield_mode",
  "channel:read:vips",
  "channel:manage:vips",
  "bits:read",
  "clips:edit",
  "whispers:edit",
  "user:read:email",
].join(" ")).split(" ");

const auth = new Hono<AuthEnv>();

auth.get("/api/auth/login", async (c) => {
  const session = c.get("session");
  const config = await getOIDCConfig();
  const { url, auth: authRequest } = await buildAuthorizeUrl(config);
  await session.update((prev) => ({ ...prev!, auth: authRequest }));
  return c.json({ url: url.toString() });
});

auth.get("/callback", async (c) => {
  const session = c.get("session");
  const error = c.req.query("error");

  if (error) {
    return c.redirect(`${APP_URL}?error=${encodeURIComponent(error)}`);
  }

  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.redirect(`${APP_URL}?error=missing_params`);
  }

  const data = await session.get();
  const savedAuth = data?.auth;

  if (!savedAuth) {
    return c.redirect(`${APP_URL}?error=invalid_state`);
  }

  try {
    const config = await getOIDCConfig();
    const redirectUri = process.env.RAWTOH_REDIRECT_URI || "http://localhost:10600/callback";
    const callbackUrl = new URL(redirectUri);
    callbackUrl.search = new URL(c.req.url).search;
    const { tokens, sub } = await exchangeCode(config, callbackUrl, {
      expectedState: savedAuth.state,
      expectedNonce: savedAuth.nonce,
      pkceCodeVerifier: savedAuth.codeVerifier,
    });

    const user = await fetchUserInfo(config, tokens.access_token, sub);
    const token_expires_at = Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600);
    await session.update({ tokens, user, sub, token_expires_at });
    return c.redirect(APP_URL);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth] Token exchange error:", msg);
    return c.redirect(`${APP_URL}?error=token_exchange`);
  }
});

auth.get("/api/auth/me", async (c) => {
  const session = c.get("session");
  const data = await session.get();
  if (!data?.user) {
    return c.json({ user: null });
  }
  return c.json({ user: data.user });
});

auth.post("/api/auth/logout", async (c) => {
  const session = c.get("session");
  session.delete();
  return c.json({ ok: true });
});

// ── Twitch OAuth ──

auth.get("/api/orgs/:orgId/twitch/connect", async (c) => {
  const session = c.get("session");
  const data = await session.get();
  if (!data?.user) return c.json({ error: "Unauthorized" }, 401);

  const orgId = c.req.param("orgId");
  const org = data.user.organizations?.find((o) => o.id === orgId);
  if (!org || org.role !== "owner") return c.json({ error: "Access denied" }, 403);

  if (!TWITCH_CLIENT_ID) {
    return c.json({ error: "TWITCH_CLIENT_ID is not configured" }, 500);
  }

  const twitchState = crypto.randomUUID();
  await session.update((prev) => ({ ...prev, twitch_oauth: { state: twitchState, orgId: org.id } }));

  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: TWITCH_SCOPES.join(" "),
    state: twitchState,
    force_verify: "true",
  });

  return c.json({ url: `https://id.twitch.tv/oauth2/authorize?${params.toString()}` });
});

auth.get("/callback/twitch", async (c) => {
  const session = c.get("session");
  const data = await session.get();
  if (!data?.user) return c.redirect(APP_URL);

  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect(`${APP_URL}?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return c.redirect(`${APP_URL}?error=missing_params`);
  }

  const twitchOauth = data.twitch_oauth;
  if (!twitchOauth || twitchOauth.state !== state) {
    return c.redirect(`${APP_URL}?error=invalid_state`);
  }

  const orgId = twitchOauth.orgId;
  await session.update((prev) => ({ ...prev, twitch_oauth: undefined }));

  try {
    const tokenData = await exchangeTwitchCode(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, code, TWITCH_REDIRECT_URI);

    const userRes = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        Authorization: `Bearer ${tokenData.accessToken}`,
      },
    });

    if (!userRes.ok) {
      throw new Error(`Failed to fetch Twitch user info (${userRes.status})`);
    }

    const userData = await userRes.json() as { data: Array<{ id: string; login: string; display_name: string }> };
    const twitchUser = userData.data[0];
    if (!twitchUser) {
      throw new Error("No user data returned from Twitch");
    }

    const { getAccountByUserId, createAccount } = await import("../db");

    const existing = await getAccountByUserId(orgId, twitchUser.id);
    if (!existing) {
      await createAccount({
        id: crypto.randomUUID(),
        orgId,
        twitchUserId: twitchUser.id,
        twitchLogin: twitchUser.login,
        twitchDisplayName: twitchUser.display_name,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        scopes: tokenData.scope.join(" "),
        expiresIn: tokenData.expiresIn,
        obtainmentTimestamp: tokenData.obtainmentTimestamp,
      });
    }

    return c.redirect(APP_URL);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[twitch-oauth] Error:", msg);
    return c.redirect(`${APP_URL}?error=twitch_exchange`);
  }
});

export default auth;
