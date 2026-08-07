// ---------------------------------------------------------------------------
// Rawtoh module authentication — Ed25519 enrollment and challenge signing.
//
// This module generates its own key pair per Twitch account and never sends the
// private half anywhere. Enrollment binds the public half to a Rawtoh instance
// once; from then on, connecting means signing a nonce the hub issues.
//
// The token carries no addressing: this module is deployed against a single
// hub and is already configured with it (RAWTOH_ISSUER, RAWTOH_WS_URL).
//
// The signed byte format is a protocol contract with the hub
// (`packages/module-auth` there). Changing it here alone locks this module out.
// ---------------------------------------------------------------------------

const CHALLENGE_CONTEXT = "rawtoh-module-register:v1";

/** What this module keeps per Twitch account once enrolled. */
export interface RawtohIdentity {
  instanceId: string;
  /** Ed25519 private key, PKCS#8, base64url. Never leaves this process. */
  privateKey: string;
}

export interface EnrollResult extends RawtohIdentity {
  instanceName: string;
  organizationId: string;
  moduleSlug: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Redeem an enrollment token: generate a key pair, hand the hub the public
 * half, keep the private half. The token is spent by the time this returns —
 * on failure the caller needs a fresh one rather than a retry.
 */
export async function enroll(apiUrl: string, enrollmentToken: string): Promise<EnrollResult> {
  const token = enrollmentToken.trim();

  const pair = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));

  const res = await fetch(`${apiUrl}/api/module-enroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, public_key: publicKey }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Enrollment failed (${res.status})`);
  }

  const data = (await res.json()) as {
    instance_id: string;
    instance_name: string;
    organization_id: string;
    module_slug: string;
  };

  return {
    instanceId: data.instance_id,
    privateKey: toBase64Url(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))),
    instanceName: data.instance_name,
    organizationId: data.organization_id,
    moduleSlug: data.module_slug,
  };
}

/** Sign a `session.challenge` nonce with this instance's private key. */
export async function signChallenge(identity: RawtohIdentity, nonce: string): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", fromBase64Url(identity.privateKey), "Ed25519", false, ["sign"]);
  const message = new TextEncoder().encode(`${CHALLENGE_CONTEXT}\n${identity.instanceId}\n${nonce}`);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("Ed25519", key, message)));
}
