import { createMiddleware } from "hono/factory";
import type { SessionEnv } from "@hono/session";
import type { TokenSet, UserInfo, AuthRequest } from "../auth";
import { getOIDCConfig, refreshAccessToken, fetchUserInfo } from "../auth";

type SessionData = {
  tokens?: TokenSet;
  token_expires_at?: number;
  user?: UserInfo;
  sub?: string;
  auth?: AuthRequest;
  twitch_oauth?: { state: string; orgId: string };
};

type AuthEnv = SessionEnv<SessionData> & {
  Variables: {
    user: UserInfo;
  };
};

export type { SessionData, AuthEnv };

const TOKEN_REFRESH_MARGIN = 60;

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = c.get("session");
  const data = await session.get();
  if (!data?.user || !data?.tokens || !data?.sub) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = data.token_expires_at ?? 0;

  if (now >= expiresAt - TOKEN_REFRESH_MARGIN && data.tokens.refresh_token) {
    try {
      const config = await getOIDCConfig();
      const newTokens = await refreshAccessToken(config, data.tokens.refresh_token);
      const newUser = await fetchUserInfo(config, newTokens.access_token, data.sub);
      const newExpiresAt = Math.floor(Date.now() / 1000) + (newTokens.expires_in ?? 3600);
      await session.update({
        tokens: newTokens,
        token_expires_at: newExpiresAt,
        user: newUser,
        sub: data.sub,
      });
      c.set("user", newUser);
    } catch (err) {
      console.error("[auth] Token refresh failed:", err);
      return c.json({ error: "Unauthorized" }, 401);
    }
  } else {
    c.set("user", data.user);
  }

  await next();
});

export function resolveOrg(role?: "owner") {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");
    const orgId = c.req.param("orgId");
    const org = user.organizations?.find((o: { id: string }) => o.id === orgId);
    if (!org) {
      return c.json({ error: "Organization not found" }, 404);
    }
    if (role && org.role !== role) {
      return c.json({ error: "Access denied" }, 403);
    }
    await next();
  });
}
