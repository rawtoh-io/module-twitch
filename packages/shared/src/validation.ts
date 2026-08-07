import { z } from "zod";

// ── Request bodies (API validation) ─────────────────────────────────

export const setCredentialsBody = z.object({
  enrollmentToken: z.string().trim().min(1, "Enrollment token required"),
});

// ── Response schemas (Web validation) ───────────────────────────────

export const orgSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().optional(),
  role: z.string(),
});

export const userInfoSchema = z.object({
  sub: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  picture: z.string().optional(),
  email_verified: z.boolean().optional(),
  organizations: z.array(orgSchema).optional(),
});

export const meResponse = z.object({
  user: userInfoSchema.nullable(),
});

export const urlResponse = z.object({
  url: z.string(),
});

export const accountSchema = z.object({
  id: z.string(),
  twitchUserId: z.string(),
  twitchLogin: z.string(),
  twitchDisplayName: z.string(),
  instanceId: z.string().nullable(),
  hasCredentials: z.boolean(),
  createdAt: z.string(),
});

export const accountsResponse = z.array(accountSchema);

export const pingResponse = z.object({
  latency: z.number(),
});

export const okResponse = z.object({
  ok: z.literal(true),
});

export const errorResponse = z.object({
  error: z.string(),
});

// ── Inferred types ──────────────────────────────────────────────────

export type SetCredentialsBody = z.infer<typeof setCredentialsBody>;
export type Org = z.infer<typeof orgSchema>;
export type UserInfo = z.infer<typeof userInfoSchema>;
export type MeResponse = z.infer<typeof meResponse>;
export type UrlResponse = z.infer<typeof urlResponse>;
export type Account = z.infer<typeof accountSchema>;
export type AccountsResponse = z.infer<typeof accountsResponse>;
export type PingResponse = z.infer<typeof pingResponse>;
export type OkResponse = z.infer<typeof okResponse>;
export type ErrorResponse = z.infer<typeof errorResponse>;
