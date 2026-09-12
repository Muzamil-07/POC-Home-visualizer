import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateEditToken() {
  return randomBytes(32).toString("base64url");
}

export function hashEditToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyEditToken(token: string, expectedHash: string) {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashEditToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
