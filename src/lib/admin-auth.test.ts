import { afterEach, describe, expect, it } from "vitest";
import {
  createAdminSession,
  credentialsMatch,
  getAdminCredentials,
  isProtectedPath,
  verifyAdminSession,
} from "./admin-auth";

const original = {
  username: process.env.USERNAME,
  password: process.env.PASSWORD,
  adminUser: process.env.ADMIN_USERNAME,
  adminPass: process.env.ADMIN_PASSWORD,
};

function restore(
  name: "USERNAME" | "PASSWORD" | "ADMIN_USERNAME" | "ADMIN_PASSWORD",
  value: string | undefined,
) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("USERNAME", original.username);
  restore("PASSWORD", original.password);
  restore("ADMIN_USERNAME", original.adminUser);
  restore("ADMIN_PASSWORD", original.adminPass);
});

describe("admin auth", () => {
  it("protects the editor and publish APIs only", () => {
    expect(isProtectedPath("/")).toBe(true);
    expect(isProtectedPath("/api/tours")).toBe(true);
    expect(isProtectedPath("/api/models/upload")).toBe(true);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/tour/demo")).toBe(false);
    expect(isProtectedPath("/api/published-tours/demo/ai-visualizations")).toBe(
      false,
    );
  });

  it("reads USERNAME and PASSWORD from the environment", () => {
    process.env.USERNAME = "admin";
    process.env.PASSWORD = "secret-pass";
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    expect(getAdminCredentials()).toEqual({
      username: "admin",
      password: "secret-pass",
      configured: true,
    });
    expect(credentialsMatch("admin", "secret-pass")).toBe(true);
    expect(credentialsMatch("admin", "wrong")).toBe(false);
  });

  it("round-trips a signed admin session", async () => {
    process.env.USERNAME = "admin";
    process.env.PASSWORD = "secret-pass";
    const token = await createAdminSession("admin");
    expect(await verifyAdminSession(token)).toBe(true);
    expect(await verifyAdminSession("1.not-valid")).toBe(false);
  });
});
