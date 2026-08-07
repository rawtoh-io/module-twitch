// ---------------------------------------------------------------------------
// Encryption at rest for the per-account Ed25519 private key.
//
// Threat model: a database that leaks on its own — a dump, a backup, a stolen
// volume, an injection — must not hand over module identities. It buys nothing
// against a compromised host, which holds the key in its environment. That
// boundary is deliberate; anything stronger means the key never lives here at
// all (KMS, Vault transit).
//
// ENCRYPTION_KEY is deliberately NOT SESSION_SECRET. Session secrets
// get rotated precisely to invalidate cookies, and that rotation must never
// make every stored private key undecryptable — each account would have to
// re-enroll from a fresh token. Two lifetimes, two secrets.
//
// There is no plaintext mode and no fallback key: a stored private key is
// always ciphertext, in every environment. This repo is public, so any
// hardcoded default would be a published key.
// ---------------------------------------------------------------------------

const FORMAT_PREFIX = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

let cachedKey: CryptoKey | null = null;

/**
 * Bind the ciphertext to the row it belongs to. Without this, someone with
 * write access to the database could copy one account's encrypted key into
 * another row and have the module authenticate as the first on its behalf.
 */
function additionalData(orgId: string, instanceId: string): Uint8Array<ArrayBuffer> {
  return toBytes(new TextEncoder().encode(`${orgId}|${instanceId}`));
}

/** WebCrypto wants an `ArrayBuffer`-backed view; Buffer and TextEncoder give `ArrayBufferLike`. */
function toBytes(source: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(source.length));
  out.set(source);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is required (openssl rand -base64 32)");
  }

  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${bytes.length} (openssl rand -base64 32)`,
    );
  }

  cachedKey = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  return cachedKey;
}

/** Fail at boot rather than on the first enrollment. */
export async function assertIdentityEncryptionReady(): Promise<void> {
  await getKey();
}

/** Returns `v1.<iv>.<ciphertext+tag>`. */
export async function encryptPrivateKey(
  privateKey: string,
  orgId: string,
  instanceId: string,
): Promise<string> {
  const key = await getKey();

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(orgId, instanceId) },
    key,
    new TextEncoder().encode(privateKey),
  );

  return [
    FORMAT_PREFIX,
    Buffer.from(iv).toString("base64url"),
    Buffer.from(ciphertext).toString("base64url"),
  ].join(".");
}

/** Inverse of `encryptPrivateKey`. */
export async function decryptPrivateKey(
  stored: string,
  orgId: string,
  instanceId: string,
): Promise<string> {
  const [prefix, ivPart, ciphertextPart] = stored.split(".");
  if (prefix !== FORMAT_PREFIX || !ivPart || !ciphertextPart) {
    throw new Error(`[identity:${orgId}] Malformed encrypted private key`);
  }

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Buffer.from(ivPart, "base64url"),
        additionalData: additionalData(orgId, instanceId),
      },
      await getKey(),
      Buffer.from(ciphertextPart, "base64url"),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    // Wrong key, tampered ciphertext, or a row moved between rows — the AAD
    // makes all three fail here rather than yield a usable key.
    throw new Error(
      `[identity:${orgId}] Failed to decrypt private key — wrong ENCRYPTION_KEY or altered row`,
    );
  }
}
