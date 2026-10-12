import { Hono } from "hono";
import { exchangeCode as exchangeTwitchCode } from "@twurple/auth";
import { authRoutes } from "@rawtoh/module-sdk/hono";
import { requireAuth, resolveOrg } from "../middleware/auth";
import type { AuthEnv, SessionData } from "../middleware/auth";
import { reconnectAccount, disconnectAccount } from "../connections";
import { getAccountByUserId, createAccount, updateAccountTokens, getAccount } from "../db";
import { buildAuthorizeUrl } from "../twitch-oauth/build-authorize-url";
import { revokeTwitchToken } from "../twitch-oauth/revoke-token";

const APP_URL = process.env.APP_URL || "http://localhost:10601";
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
  "channel:read:redemptions",
  "channel:manage:redemptions",
  "channel:edit:commercial",
  "moderator:manage:banned_users",
  "moderator:read:chatters",
  "moderator:read:followers",
  "moderator:manage:chat_messages",
  "moderator:manage:announcements",
  "moderator:manage:shoutouts",
  "moderator:read:shield_mode",
  "moderator:manage:shield_mode",
  "channel:read:vips",
  "channel:manage:vips",
  "bits:read",
  "clips:edit",
  "whispers:read",
  "whispers:edit",
  "user:read:email",
].join(" ")).split(" ");

const auth = new Hono<AuthEnv>();

auth.route("/", authRoutes<SessionData>(APP_URL));

// ── Twitch OAuth ──

auth.get("/api/orgs/:orgId/twitch/connect", requireAuth, resolveOrg("owner"), async (c) => {
  const session = c.get("session");
  const orgId = c.req.param("orgId");

  if (!TWITCH_CLIENT_ID) {
    return c.json({ error: "TWITCH_CLIENT_ID is not configured" }, 500);
  }

  const twitchState = crypto.randomUUID();
  await session.update((prev) => ({ ...prev, twitch_oauth: { state: twitchState, orgId } }));

  return c.json({ url: buildAuthorizeUrl({ clientId: TWITCH_CLIENT_ID, redirectUri: TWITCH_REDIRECT_URI, scopes: TWITCH_SCOPES, state: twitchState }) });
});

// Drop the current Twitch token and start a fresh OAuth flow for an existing account.
// The callback updates the stored tokens and reconnects the account.
auth.post("/api/orgs/:orgId/accounts/:accountId/twitch/reauthorize", requireAuth, resolveOrg("owner"), async (c) => {
  const session = c.get("session");
  const orgId = c.req.param("orgId");

  if (!TWITCH_CLIENT_ID) {
    return c.json({ error: "TWITCH_CLIENT_ID is not configured" }, 500);
  }

  const account = await getAccount(c.req.param("accountId"));
  if (!account || account.orgId !== orgId) return c.json({ error: "Account not found" }, 404);

  disconnectAccount(account.id);
  const revoked = await revokeTwitchToken(TWITCH_CLIENT_ID, account.accessToken);
  if (!revoked) console.warn(`[twitch-oauth] Revoke failed for ${account.twitchLogin}, continuing with re-consent`);

  const twitchState = crypto.randomUUID();
  await session.update((prev) => ({ ...prev, twitch_oauth: { state: twitchState, orgId } }));

  return c.json({ url: buildAuthorizeUrl({ clientId: TWITCH_CLIENT_ID, redirectUri: TWITCH_REDIRECT_URI, scopes: TWITCH_SCOPES, state: twitchState }) });
});

auth.get("/callback/twitch", requireAuth, async (c) => {
  const session = c.get("session");
  const data = await session.get();

  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect(`${APP_URL}?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return c.redirect(`${APP_URL}?error=missing_params`);
  }

  const twitchOauth = data?.twitch_oauth;
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

    const existing = await getAccountByUserId(orgId, twitchUser.id);
    if (existing) {
      // Re-consent is the only way to grant scopes added after the first connect.
      await updateAccountTokens(
        existing.id,
        tokenData.accessToken,
        tokenData.refreshToken,
        tokenData.expiresIn,
        tokenData.obtainmentTimestamp,
        tokenData.scope.join(" "),
      );
      const updated = await getAccount(existing.id);
      if (updated?.instanceId && updated.privateKey) {
        reconnectAccount(updated).catch((err) => {
          console.error(`[twitch-oauth] Reconnect failed: ${err instanceof Error ? err.message : err}`);
        });
      }
    } else {
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
