import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_SIGNED_URL_SECONDS,
  AI_STORAGE_BUCKET,
} from "@/lib/ai-visualization";

export function visualizationObjectPath(input: {
  tourId: string;
  visitorId: string;
  threadId: string;
  messageId: string;
  kind: "capture" | "generated";
  extension: "jpg" | "png";
}) {
  return `${input.tourId}/${input.visitorId}/${input.threadId}/${input.messageId}-${input.kind}.${input.extension}`;
}

export async function uploadVisualizationImage(
  supabase: SupabaseClient,
  path: string,
  bytes: Buffer,
  mimeType: string,
) {
  const { error } = await supabase.storage
    .from(AI_STORAGE_BUCKET)
    .upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
    });
  if (error) {
    throw new Error(`Couldn't store the visualization image (${error.message}).`);
  }
}

export async function signedVisualizationUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(AI_STORAGE_BUCKET)
    .createSignedUrl(path, AI_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
