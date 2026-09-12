export function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

export function originFromHeaders(headers: {
  get(name: string): string | null;
}) {
  const forwardedHost = headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || headers.get("host")?.trim();
  if (!host) return null;
  const hostname = host.split(":")[0] || host;
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (isLocalHostname(hostname) ? "http" : "https");
  return `${proto}://${host}`.replace(/\/$/, "");
}

export function originFromEnv() {
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "http://localhost:3000";
}

export function resolvePublicOrigin(source?: Request | { get(name: string): string | null }) {
  const headers =
    source instanceof Request ? source.headers : source ?? null;
  const fromHeaders = headers ? originFromHeaders(headers) : null;
  if (fromHeaders) return fromHeaders;
  return originFromEnv();
}

export function publicSharePath(slug: string) {
  return `/tour/${slug}`;
}

export function rewriteShareUrlForClient(
  shareUrl: string,
  currentOrigin =
    typeof window === "undefined" ? "" : window.location.origin,
) {
  if (!shareUrl || !currentOrigin) return shareUrl;
  try {
    const parsed = new URL(shareUrl, currentOrigin);
    const current = new URL(currentOrigin);
    if (
      isLocalHostname(parsed.hostname) &&
      !isLocalHostname(current.hostname)
    ) {
      return `${current.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Keep the stored URL if it cannot be parsed.
  }
  return shareUrl;
}
