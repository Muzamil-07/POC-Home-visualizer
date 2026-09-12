import { describe, expect, it } from "vitest";
import {
  generateEditToken,
  hashEditToken,
  verifyEditToken,
} from "./edit-token";

describe("edit tokens", () => {
  it("hashes and verifies a generated token", () => {
    const token = generateEditToken();
    const hash = hashEditToken(token);
    expect(hash).toHaveLength(64);
    expect(verifyEditToken(token, hash)).toBe(true);
    expect(verifyEditToken("other-token", hash)).toBe(false);
    expect(verifyEditToken(token, hashEditToken("other-token"))).toBe(false);
  });

  it("rejects empty values", () => {
    expect(verifyEditToken("", hashEditToken("abc"))).toBe(false);
    expect(verifyEditToken("abc", "")).toBe(false);
  });
});
