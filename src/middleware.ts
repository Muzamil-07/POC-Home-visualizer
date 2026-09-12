import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  getAdminCredentials,
  isProtectedPath,
  verifyAdminSession,
} from "@/lib/admin-auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const { configured } = getAdminCredentials();
  if (!configured) {
    if (process.env.VERCEL) {
      return deny(request, pathname);
    }
    return NextResponse.next();
  }

  const ok = await verifyAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
  if (ok) return NextResponse.next();
  return deny(request, pathname);
}

function deny(request: NextRequest, pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/", "/api/tours/:path*", "/api/models/:path*"],
};
