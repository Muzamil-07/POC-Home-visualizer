import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { visitorSecret } from "@/lib/ai-visitor";
import {
  decryptSecret,
  encryptSecret,
  hashOpenAiEncryptionSecret,
  maskOpenAiApiKey,
  normalizeOpenAiApiKey,
} from "@/lib/ai-openai-key";
import { AiVisualizationError } from "@/lib/ai-visualization-service";

export type VisitorOpenAiKeyMeta = {
  last4: string;
};

export type VisitorOpenAiKey = VisitorOpenAiKeyMeta & {
  apiKey: string;
};

function encryptionSecret() {
  return hashOpenAiEncryptionSecret(visitorSecret());
}

function mapKeyTableError(error: { code?: string; message?: string } | null) {
  if (
    error?.code === "PGRST205" ||
    error?.message?.includes("ai_visitor_openai_keys")
  ) {
    return new AiVisualizationError(
      "Visitor API key storage is missing in Supabase. Run supabase/migrations/003_ai_visitor_openai_keys.sql in the SQL Editor.",
      "migration_missing",
      503,
    );
  }
  return null;
}

export async function loadVisitorOpenAiKey(
  supabase: SupabaseClient,
  visitorId: string,
): Promise<VisitorOpenAiKey | null> {
  const { data, error } = await supabase
    .from("ai_visitor_openai_keys")
    .select("encrypted_key, key_last4")
    .eq("visitor_session_id", visitorId)
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("ai_visitor_openai_keys")) {
      return null;
    }
    throw (
      mapKeyTableError(error) ||
      new AiVisualizationError("Couldn't load the saved OpenAI key.", "unknown", 500)
    );
  }
  if (!data?.encrypted_key) return null;
  try {
    const apiKey = decryptSecret(data.encrypted_key, encryptionSecret());
    const last4 = maskOpenAiApiKey(apiKey) || data.key_last4;
    return { apiKey, last4 };
  } catch {
    console.error("[ai-openai-key] stored key could not be decrypted");
    return null;
  }
}

export async function loadVisitorOpenAiKeyMeta(
  supabase: SupabaseClient,
  visitorId: string,
): Promise<VisitorOpenAiKeyMeta | null> {
  const { data, error } = await supabase
    .from("ai_visitor_openai_keys")
    .select("key_last4")
    .eq("visitor_session_id", visitorId)
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("ai_visitor_openai_keys")) {
      return null;
    }
    throw (
      mapKeyTableError(error) ||
      new AiVisualizationError("Couldn't load the saved OpenAI key.", "unknown", 500)
    );
  }
  if (!data?.key_last4) return null;
  return { last4: data.key_last4 };
}

export async function saveVisitorOpenAiKey(
  supabase: SupabaseClient,
  visitorId: string,
  rawKey: unknown,
) {
  const apiKey = normalizeOpenAiApiKey(rawKey);
  if (!apiKey) {
    throw new AiVisualizationError(
      "Enter a valid paid OpenAI API key. It should start with sk-.",
      "invalid_api_key",
      400,
    );
  }
  await assertOpenAiKeyWorks(apiKey);
  const last4 = maskOpenAiApiKey(apiKey);
  if (!last4) {
    throw new AiVisualizationError(
      "Enter a valid paid OpenAI API key. It should start with sk-.",
      "invalid_api_key",
      400,
    );
  }
  const encrypted = encryptSecret(apiKey, encryptionSecret());
  const { error } = await supabase.from("ai_visitor_openai_keys").upsert({
    visitor_session_id: visitorId,
    encrypted_key: encrypted,
    key_last4: last4,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw (
      mapKeyTableError(error) ||
      new AiVisualizationError("Couldn't save this OpenAI key.", "unknown", 500)
    );
  }
  return { last4 };
}

export async function deleteVisitorOpenAiKey(
  supabase: SupabaseClient,
  visitorId: string,
) {
  const { error } = await supabase
    .from("ai_visitor_openai_keys")
    .delete()
    .eq("visitor_session_id", visitorId);
  if (error) {
    throw (
      mapKeyTableError(error) ||
      new AiVisualizationError("Couldn't remove the saved OpenAI key.", "unknown", 500)
    );
  }
}

async function assertOpenAiKeyWorks(apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    throw new AiVisualizationError(
      "OpenAI rejected this API key. Check that it is a paid key with access to image generation.",
      "invalid_api_key",
      400,
    );
  }
  if (!response.ok) {
    throw new AiVisualizationError(
      "Couldn't verify this OpenAI key right now. Try again in a moment.",
      "openai_failed",
      502,
    );
  }
}

export function visitorKeyPublicStatus(meta: VisitorOpenAiKeyMeta | null) {
  return {
    saved: Boolean(meta),
    last4: meta?.last4 ?? null,
  };
}

export function withVisitorBilling<T extends { followUpsRemaining?: number }>(
  payload: T,
  meta: VisitorOpenAiKeyMeta | null,
) {
  const unlimited = Boolean(meta);
  return {
    ...payload,
    unlimited,
    followUpsRemaining: unlimited ? 9999 : (payload.followUpsRemaining ?? 0),
    openaiKey: visitorKeyPublicStatus(meta),
  };
}
