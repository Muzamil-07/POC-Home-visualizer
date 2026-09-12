import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_MODEL_UPLOAD_BYTES,
  MODELS_BUCKET,
  publicStorageObjectUrl,
  sanitizeModelFilename,
  uploadedModelObjectPath,
} from "@/lib/model-storage";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  filename: z.string().trim().min(1).max(180),
  byteSize: z.number().int().positive().max(MAX_MODEL_UPLOAD_BYTES),
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse("Request body must be JSON.", 400);
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return errorResponse(first?.message || "Upload request is invalid.", 400);
  }

  if (!parsed.data.filename.toLowerCase().endsWith(".glb")) {
    return errorResponse("Only .glb files are supported.", 400);
  }

  let supabase;
  try {
    supabase = createServiceSupabase();
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Supabase is not configured.",
      503,
    );
  }

  const filename = sanitizeModelFilename(parsed.data.filename);
  const path = uploadedModelObjectPath(filename);
  const { data, error } = await supabase.storage
    .from(MODELS_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data?.signedUrl || !data.token) {
    const message = error?.message || "Couldn't create an upload URL.";
    if (/not found|does not exist|bucket/i.test(message)) {
      return errorResponse(
        "The tour-models bucket is missing. Run supabase/migrations/004_model_storage.sql, then raise the Storage global file size limit to at least 256 MB.",
        500,
      );
    }
    return errorResponse(`Couldn't create an upload URL (${message}).`, 500);
  }

  const publicUrl = publicStorageObjectUrl(MODELS_BUCKET, path);
  if (!publicUrl) {
    return errorResponse("NEXT_PUBLIC_SUPABASE_URL is missing.", 503);
  }

  return NextResponse.json({
    bucket: MODELS_BUCKET,
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl,
    filename,
  });
}
