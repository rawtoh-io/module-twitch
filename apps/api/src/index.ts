import { useSession, useSessionStorage } from "@hono/session";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { startAllConnections } from "./connections";
import { assertIdentityEncryptionReady } from "./identity-crypto";
import type { AuthEnv, SessionData } from "./middleware/auth";
import accountRoutes from "./routes/accounts";
import authRoutes from "./routes/auth";
import { sessionStorage } from "./session-storage";

const PORT = parseInt(process.env.PORT || "10600", 10);
const APP_URL = process.env.APP_URL || "http://localhost:10601";
// Served over HTTPS ⇒ production: session cookies must be Secure and the
// session secret must be real (no fallback).
const isProduction = APP_URL.startsWith("https://");

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET && isProduction) {
	throw new Error(
		"SESSION_SECRET is required when APP_URL is served over HTTPS",
	);
}

// Encrypts the Ed25519 private keys at rest. Kept separate from SESSION_SECRET
// on purpose: rotating a session secret must not orphan every stored identity.
// Required in every environment, so fail here rather than at first enrollment.
await assertIdentityEncryptionReady();

const app = new Hono<AuthEnv>();

app.use(
	"*",
	cors({
		origin: APP_URL,
		credentials: true,
	}),
);

app.use("*", useSessionStorage(sessionStorage));

app.use(
	"*",
	useSession<SessionData>({
		secret: SESSION_SECRET || "a".repeat(64), // dev-only fallback
		duration: { absolute: 60 * 60 * 24 * 30 },
		setCookie: (c, name, value, opt) =>
			setCookie(c, name, value, { ...opt, secure: isProduction }),
	}),
);

// Routes
app.route("/", authRoutes);
app.route("/", accountRoutes);

// Health check (k8s probes)
app.get("/health", (c) => c.json({ ok: true }));

// Start WS connections
startAllConnections();

export default {
	port: PORT,
	hostname: "0.0.0.0",
	idleTimeout: 0,
	fetch: app.fetch,
};

console.log(`[twitch-api] Listening on http://0.0.0.0:${PORT}`);
