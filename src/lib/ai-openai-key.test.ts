import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  maskOpenAiApiKey,
  normalizeOpenAiApiKey,
} from "./ai-openai-key";

const secret = createHash("sha256").update("test-openai-key-secret").digest();

describe("visitor OpenAI key helpers", () => {
  it("accepts paid key shapes and rejects junk", () => {
    expect(normalizeOpenAiApiKey("sk-proj-abcdefghijklmnopqrstuvwxyz")).toMatch(
      /^sk-proj-/,
    );
    expect(normalizeOpenAiApiKey(" sk-abcdefghijklmnopqrstuvwxyz ")).toBe(
      "sk-abcdefghijklmnopqrstuvwxyz",
    );
    expect(normalizeOpenAiApiKey("not-a-key")).toBeNull();
    expect(normalizeOpenAiApiKey("sk-short")).toBeNull();
    expect(normalizeOpenAiApiKey("sk-abc defghijklmnopqrstuvwxyz")).toBeNull();
  });

  it("only exposes the last four characters", () => {
    expect(maskOpenAiApiKey("sk-abcdefghijklmnopqrstuvwxyz")).toBe("wxyz");
  });

  it("round-trips encrypted secrets", () => {
    const plain = "sk-proj-abcdefghijklmnopqrstuvwxyz";
    const packed = encryptSecret(plain, secret);
    expect(packed).not.toContain(plain);
    expect(decryptSecret(packed, secret)).toBe(plain);
  });
});
