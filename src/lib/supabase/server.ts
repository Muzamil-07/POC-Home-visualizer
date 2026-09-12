import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  return { url, publishableKey };
}

export function assertServiceSupabaseConfig() {
  const { url, publishableKey } = getPublicSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing. This server-only key is required to publish Tours.",
    );
  }
  return { url, publishableKey, serviceRoleKey };
}

export function createServiceSupabase(): SupabaseClient {
  const { url, serviceRoleKey } = assertServiceSupabaseConfig();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAnonSupabase(): SupabaseClient | null {
  const { url, publishableKey } = getPublicSupabaseConfig();
  if (!url || !publishableKey) return null;
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function publicShareUrl(slug: string) {
  return `${getAppUrl()}/tour/${slug}`;
}
