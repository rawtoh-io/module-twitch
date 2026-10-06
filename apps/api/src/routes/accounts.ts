import { Hono } from "hono";
import { hubAuthHeaders, requireAuth, resolveOrg } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";
import { getRawtohApiUrl } from "@rawtoh/module-sdk";
import { enroll, InstallError, installInstance } from "@rawtoh/module-sdk";
import {
  listAccounts,
  getAccount,
  setAccountIdentity,
  deleteAccountIdentity,
  deleteAccount,
} from "../db";
import { reconnectAccount, disconnectAccount, isAccountConnected, getAccountWsClient, getDisconnectReason, connectionEvents } from "../connections";
import { setCredentialsBody } from "@module-twitch/shared/validation";

// Override to install a second copy (e.g. a local dev build) under another slug
const MODULE_SLUG = process.env.RAWTOH_MODULE_SLUG || "twitch";

const CONNECT_TIMEOUT_MS = 10_000;

/** Race a connection attempt against a timeout so HTTP requests never hang. */
function withConnectTimeout(promise: Promise<void>): Promise<void> {
  return Promise.race([
    promise,
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout")), CONNECT_TIMEOUT_MS),
    ),
  ]);
}

const accounts = new Hono<AuthEnv>();

// List all Twitch accounts for an org
accounts.get("/api/orgs/:orgId/accounts", requireAuth, resolveOrg("owner"), async (c) => {
  const orgId = c.req.param("orgId");
  const accounts = await listAccounts(orgId);
  return c.json(accounts.map((a) => ({
    id: a.id,
    twitchUserId: a.twitchUserId,
    twitchLogin: a.twitchLogin,
    twitchDisplayName: a.twitchDisplayName,
    instanceId: a.instanceId,
    hasCredentials: !!(a.instanceId && a.privateKey),
    createdAt: a.createdAt,
  })));
});

// SSE stream for connection status changes
accounts.get("/api/orgs/:orgId/accounts/events", requireAuth, resolveOrg("owner"), async (c) => {
  const orgId = c.req.param("orgId");
  const accounts = await listAccounts(orgId);

  return c.body(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));

        // Send initial state
        const initial = accounts.map((a) => ({
          accountId: a.id,
          connected: isAccountConnected(a.id),
          reason: getDisconnectReason(a.id),
        }));
        send(JSON.stringify({ type: "init", accounts: initial }));

        const onStatus = (event: { accountId: string; connected: boolean; reason?: string | null }) => {
          if (accounts.some((a) => a.id === event.accountId)) {
            send(JSON.stringify({ type: "status", accountId: event.accountId, connected: event.connected, reason: event.reason ?? null }));
          }
        };
        connectionEvents.on("status", onStatus);

        // Keepalive
        const keepalive = setInterval(() => {
          try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { clearInterval(keepalive); }
        }, 30000);

        // Cleanup on close
        c.req.raw.signal.addEventListener("abort", () => {
          connectionEvents.off("status", onStatus);
          clearInterval(keepalive);
        });
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }
  );
});

// Self-service install: provisions the module instance in Rawtoh using the
// user's own hub credentials (forwarded session cookie, or an OIDC token
// with the module:install scope) — no copy/paste.
accounts.post("/api/orgs/:orgId/accounts/:accountId/install", requireAuth, resolveOrg("owner"), async (c) => {
  const orgId = c.req.param("orgId");
  const account = await getAccount(c.req.param("accountId"));
  if (!account || account.orgId !== orgId) return c.json({ error: "Account not found" }, 404);

  if (account.instanceId && account.privateKey) {
    return c.json({ error: "Module already installed" }, 400);
  }

  const authHeaders = await hubAuthHeaders(c);
  if (!authHeaders) {
    return c.json({ error: "No Rawtoh credentials in session" }, 401);
  }

  // Rawtoh resolves the slug: the org's own definition first, then the global catalog.
  let identity;
  try {
    identity = await installInstance(getRawtohApiUrl(), authHeaders, orgId, { slug: MODULE_SLUG, name: account.twitchLogin });
  } catch (err) {
    const status = err instanceof InstallError && err.code === "session_expired" ? 401 : 502;
    return c.json({ error: err instanceof Error ? err.message : "Install failed" }, status);
  }
  await setAccountIdentity(account.id, identity);

  const updated = await getAccount(account.id);
  if (updated) {
    try {
      await withConnectTimeout(reconnectAccount(updated));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      return c.json({ ok: true, warning: msg });
    }
  }

  return c.json({ ok: true });
});

// Enroll a Twitch account with a token pasted from Rawtoh (advanced)
accounts.put("/api/orgs/:orgId/accounts/:accountId/credentials", requireAuth, resolveOrg("owner"), async (c) => {
  const orgId = c.req.param("orgId");
  const account = await getAccount(c.req.param("accountId"));
  if (!account || account.orgId !== orgId) return c.json({ error: "Account not found" }, 404);

  const parsed = setCredentialsBody.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Invalid enrollment data", issues: parsed.error.issues }, 400);
  }

  // The token is single-use: a failure here needs a fresh one, not a retry.
  let identity;
  try {
    identity = await enroll(getRawtohApiUrl(), parsed.data.enrollmentToken);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Enrollment failed" }, 400);
  }
  await setAccountIdentity(account.id, identity);
  const updated = await getAccount(account.id);
  if (updated) {
    try {
      await withConnectTimeout(reconnectAccount(updated));
      return c.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      return c.json({ ok: true, warning: msg });
    }
  }

  return c.json({ ok: true });
});

// Forget the signing key (account can no longer connect to the hub)
accounts.delete("/api/orgs/:orgId/accounts/:accountId/credentials", requireAuth, resolveOrg("owner"), async (c) => {
  const orgId = c.req.param("orgId");
  const account = await getAccount(c.req.param("accountId"));
  if (!account || account.orgId !== orgId) return c.json({ error: "Account not found" }, 404);

  await deleteAccountIdentity(account.id);
  disconnectAccount(account.id);

  return c.json({ ok: true });
});

// Remove a Twitch account
accounts.delete("/api/orgs/:orgId/accounts/:accountId", requireAuth, resolveOrg("owner"), async (c) => {
  const orgId = c.req.param("orgId");
  const account = await getAccount(c.req.param("accountId"));
  if (!account || account.orgId !== orgId) return c.json({ error: "Account not found" }, 404);

  disconnectAccount(account.id);
  await deleteAccount(account.id);

  return c.json({ ok: true });
});

// Disconnect a Twitch account
accounts.post("/api/orgs/:orgId/accounts/:accountId/disconnect", requireAuth, resolveOrg("owner"), async (c) => {
  const orgId = c.req.param("orgId");
  const account = await getAccount(c.req.param("accountId"));
  if (!account || account.orgId !== orgId) return c.json({ error: "Account not found" }, 404);

  disconnectAccount(account.id);
  return c.json({ ok: true });
});

// Reconnect a Twitch account
accounts.post("/api/orgs/:orgId/accounts/:accountId/reconnect", requireAuth, resolveOrg("owner"), async (c) => {
  const orgId = c.req.param("orgId");
  const account = await getAccount(c.req.param("accountId"));
  if (!account || account.orgId !== orgId) return c.json({ error: "Account not found" }, 404);
  if (!account.instanceId || !account.privateKey) return c.json({ error: "Account not enrolled" }, 400);

  try {
    await withConnectTimeout(reconnectAccount(account));
    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    return c.json({ error: msg }, 502);
  }
});

// Ping a Twitch account's WS connection
accounts.post("/api/orgs/:orgId/accounts/:accountId/ping", requireAuth, resolveOrg("owner"), async (c) => {
  const orgId = c.req.param("orgId");
  const account = await getAccount(c.req.param("accountId"));
  if (!account || account.orgId !== orgId) return c.json({ error: "Account not found" }, 404);

  const client = getAccountWsClient(account.id);
  if (!client) {
    return c.json({ error: "Not connected" }, 400);
  }

  const start = performance.now();
  try {
    await Promise.race([
      client.request("ping", {}),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)),
    ]);
    const latency = Math.round(performance.now() - start);
    return c.json({ latency });
  } catch {
    return c.json({ error: "Ping failed" }, 500);
  }
});

export default accounts;
