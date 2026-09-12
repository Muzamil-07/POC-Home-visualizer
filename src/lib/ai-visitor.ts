import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createHash } from "node:crypto";

export const AI_VISITOR_COOKIE = "poc_ai_visitor";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export function visitorSecret() {
  const explicit = process.env.AI_VISITOR_SECRET?.trim();
  if (explicit) return explicit;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "local-dev";
  return createHash("sha256").update(`${service}:ai-visitor`).digest("hex");
}

export function signVisitorId(visitorId: string) {
  const mac = createHmac("sha256", visitorSecret())
    .update(visitorId)
    .digest("base64url");
  return `${visitorId}.${mac}`;
}

export function verifyVisitorCookie(value: string | undefined | null) {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const visitorId = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(visitorId) || !mac) return null;
  const expected = createHmac("sha256", visitorSecret())
    .update(visitorId)
    .digest("base64url");
  const actualBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(actualBuf, expectedBuf)) return null;
  return visitorId;
}

export function createVisitorId() {
  return randomUUID();
}

export function visitorCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

export function hashIpSignal(ip: string | null) {
  if (!ip) return null;
  const trimmed = ip.split(",")[0]?.trim() || "";
  if (!trimmed) return null;
  return createHash("sha256")
    .update(`${visitorSecret()}:${trimmed}`)
    .digest("hex")
    .slice(0, 32);
}

export function clientIpFromRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip");
}

export async function withVisitorCookie() {
  const store = await cookies();
  const existing = verifyVisitorCookie(store.get(AI_VISITOR_COOKIE)?.value);
  const visitorId = existing ?? createVisitorId();
  if (!existing) {
    store.set(AI_VISITOR_COOKIE, signVisitorId(visitorId), visitorCookieOptions());
  }
  return visitorId;
}
