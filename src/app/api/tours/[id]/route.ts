import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { hashEditToken, verifyEditToken } from "@/lib/edit-token";
import {
  MAX_TOUR_JSON_BYTES,
  normalizePublishedTourData,
  publishTourRequestSchema,
} from "@/lib/tour-schema";
import { DAY_ENVIRONMENT } from "@/lib/lighting";
import { createServiceSupabase, publicShareUrl } from "@/lib/supabase/server";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function fromZod(error: ZodError) {
  return error.issues[0]?.message || "Tour payload is invalid.";
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const token = request.headers.get("x-tour-edit-token")?.trim() || "";
  if (!token) {
    return errorResponse("An edit token is required to update this tour.", 401);
  }

  const raw = await request.text();
  if (raw.length > MAX_TOUR_JSON_BYTES) {
    return errorResponse("Tour payload is too large.", 413);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse("Request body must be JSON.", 400);
  }

  const parsed = publishTourRequestSchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse(fromZod(parsed.error), 400);
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

  const { data: existing, error: loadError } = await supabase
    .from("tours")
    .select("id, slug, edit_token_hash")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    console.error("[tours] update lookup failed", loadError.code);
    return errorResponse("Couldn't update this tour.", 500);
  }
  if (!existing) {
    return errorResponse("Tour not found.", 404);
  }
  if (!verifyEditToken(token, existing.edit_token_hash)) {
    return errorResponse("This browser cannot update that published tour.", 403);
  }

  const tourData = normalizePublishedTourData(parsed.data.tourData);
  const { error } = await supabase
    .from("tours")
    .update({
      title: parsed.data.title,
      model_url: tourData.model.url,
      model_fingerprint: tourData.model.fingerprint ?? null,
      tour_data: tourData,
      default_environment: DAY_ENVIRONMENT,
      allow_environment_switch: false,
      is_published: parsed.data.isPublished,
      schema_version: tourData.schemaVersion,
    })
    .eq("id", id)
    .eq("edit_token_hash", hashEditToken(token));

  if (error) {
    console.error("[tours] update failed", error.code);
    return errorResponse("Couldn't update this tour.", 500);
  }

  return NextResponse.json({
    id: existing.id,
    slug: existing.slug,
    shareUrl: publicShareUrl(existing.slug, request),
  });
}
