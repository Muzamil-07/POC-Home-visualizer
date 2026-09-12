export const ADMIN_COOKIE = "poc_admin_session";
export const ADMIN_MAX_AGE = 60 * 60 * 24 * 30;

export function getAdminCredentials() {
  const username = (
    process.env.ADMIN_USERNAME ||
    process.env.USERNAME ||
    ""
  ).trim();
  const password = (
    process.env.ADMIN_PASSWORD ||
    process.env.PASSWORD ||
    ""
  ).trim();
  return {
    username,
    password,
    configured: Boolean(username && password),
  };
}

export function isProtectedPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/api/tours") ||
    pathname.startsWith("/api/models")
  );
}

export function adminCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE,
  };
}

export function credentialsMatch(username: string, password: string) {
  const expected = getAdminCredentials();
  if (!expected.configured) return false;
  return (
    safeEqual(username.trim(), expected.username) &&
    safeEqual(password, expected.password)
  );
}

export async function createAdminSession(username: string) {
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const payload = `${issuedAt}:${username.trim()}`;
  const signature = await signPayload(payload);
  return `${issuedAt}.${signature}`;
}

export async function verifyAdminSession(value: string | undefined | null) {
  if (!value) return false;
  const { configured, username } = getAdminCredentials();
  if (!configured) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const issuedAt = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!/^\d+$/.test(issuedAt) || !signature) return false;
  const age = Math.floor(Date.now() / 1000) - Number(issuedAt);
  if (age < 0 || age > ADMIN_MAX_AGE) return false;
  const expected = await signPayload(`${issuedAt}:${username}`);
  return safeEqual(signature, expected);
}

function adminSecret() {
  const { password } = getAdminCredentials();
  return [
    "poc-admin",
    password,
    process.env.AI_VISITOR_SECRET?.trim() || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
  ].join(":");
}

async function signPayload(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(adminSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toBase64Url(new Uint8Array(signature));
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(left: string, right: string) {
  const max = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let index = 0; index < max; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}
