import { pgTable, text, integer, bigint, timestamp } from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  // Rawtoh module instance this account drives, and the Ed25519 private key it
  // proves ownership of. Generated here at enrollment; the hub only ever sees
  // the public half. Null until the account is enrolled.
  instanceId: text("instance_id"),
  privateKey: text("private_key"),
  twitchUserId: text("twitch_user_id").notNull(),
  twitchLogin: text("twitch_login").notNull(),
  twitchDisplayName: text("twitch_display_name").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  scopes: text("scopes").notNull().default(""),
  expiresIn: integer("expires_in"),
  obtainmentTimestamp: bigint("obtainment_timestamp", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable("session", {
  sid: text("sid").primaryKey(),
  data: text("data").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type Account = InferSelectModel<typeof account>;
export type AccountInsert = InferInsertModel<typeof account>;
export type Session = InferSelectModel<typeof session>;
