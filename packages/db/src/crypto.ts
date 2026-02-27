import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const LEGACY_INSECURE_APP_TOKEN = "change-me";

let warnedLegacyFallback = false;

function deriveKey(raw: string): Buffer {
  return createHash("sha256").update(raw).digest();
}

function getPrimaryKeyMaterial(): string {
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim();
  if (encryptionKey) {
    return encryptionKey;
  }

  const appToken = process.env.APP_TOKEN?.trim();
  if (appToken && appToken !== LEGACY_INSECURE_APP_TOKEN) {
    if (!warnedLegacyFallback) {
      warnedLegacyFallback = true;
      // Backward compatibility for existing local setups.
      console.warn("[db/crypto] ENCRYPTION_KEY is missing. Falling back to APP_TOKEN (legacy behavior).");
    }
    return appToken;
  }

  throw new Error("Missing ENCRYPTION_KEY. Set ENCRYPTION_KEY in environment.");
}

function getPrimaryKey(): Buffer {
  return deriveKey(getPrimaryKeyMaterial());
}

function getLegacyFallbackKey(primaryKeyMaterial: string): Buffer | null {
  const appToken = process.env.APP_TOKEN?.trim();
  if (!appToken || appToken === LEGACY_INSECURE_APP_TOKEN || appToken === primaryKeyMaterial) {
    return null;
  }
  return deriveKey(appToken);
}

function decryptWithKey(value: string, key: Buffer): string {
  const packed = Buffer.from(value, "base64");
  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(tag);
  const result = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return result.toString("utf8");
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getPrimaryKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(value: string): string {
  const primaryKeyMaterial = getPrimaryKeyMaterial();
  const primaryKey = deriveKey(primaryKeyMaterial);

  try {
    return decryptWithKey(value, primaryKey);
  } catch (error) {
    const fallbackKey = getLegacyFallbackKey(primaryKeyMaterial);
    if (!fallbackKey) {
      throw error;
    }
    return decryptWithKey(value, fallbackKey);
  }
}
