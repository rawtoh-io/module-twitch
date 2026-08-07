import { and, eq, gt } from "drizzle-orm";
import type { Storage } from "@hono/session";
import { db } from "./db";
import { session } from "./db/schema";
import type { SessionData } from "./middleware/auth";

// Must match the `duration` passed to useSession() in index.ts
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Server-side session storage (PostgreSQL).
 *
 * @hono/session is stateless by default: the whole session (tokens + user) is
 * encrypted into the cookie, which exceeds the 4 KB browser limit and gets
 * silently dropped. With a storage, the cookie only carries the session id.
 *
 * Note: the library does not await set()/delete() — errors are logged, not thrown.
 */
export const sessionStorage: Storage<SessionData> = {
  async get(sid) {
    const [row] = await db
      .select({ data: session.data })
      .from(session)
      .where(and(eq(session.sid, sid), gt(session.expiresAt, new Date())));
    if (!row) return null;
    try {
      return JSON.parse(row.data) as SessionData;
    } catch {
      return null;
    }
  },
  set(sid, value) {
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const data = JSON.stringify(value);
    db.insert(session)
      .values({ sid, data, expiresAt })
      .onConflictDoUpdate({ target: session.sid, set: { data, expiresAt } })
      .catch((err) => console.error("[session] Persist failed:", err));
  },
  delete(sid) {
    db.delete(session)
      .where(eq(session.sid, sid))
      .catch((err) => console.error("[session] Delete failed:", err));
  },
};
