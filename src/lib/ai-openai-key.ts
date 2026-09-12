import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "sk-";
const MIN_KEY_LENGTH = 20;

export function normalizeOpenAiApiKey(value: unknown) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (!key.startsWith(KEY_PREFIX) || key.length < MIN_KEY_LENGTH) return null;
  if (/\s/.test(key)) return null;
  return key;
}

export function maskOpenAiApiKey(key: string) {
  const last4 = key.slice(-4);
  return last4.length === 4 ? last4 : null;
}

export function encryptSecret(plain: string, secret: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string, secret: Buffer) {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Encrypted payload is malformed.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secret,
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashOpenAiEncryptionSecret(material: string) {
  return createHash("sha256").update(`${material}:openai-visitor-key`).digest();
}
