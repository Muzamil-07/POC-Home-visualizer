import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createAdminSession,
  credentialsMatch,
  getAdminCredentials,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { configured, username } = getAdminCredentials();
  if (!configured) {
    return NextResponse.json(
      { error: "Admin credentials are not configured." },
      { status: 503 },
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { username?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const nextUsername = typeof body.username === "string" ? body.username : "";
  const nextPassword = typeof body.password === "string" ? body.password : "";
  if (!credentialsMatch(nextUsername, nextPassword)) {
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    ADMIN_COOKIE,
    await createAdminSession(username),
    adminCookieOptions(),
  );
  return response;
}
