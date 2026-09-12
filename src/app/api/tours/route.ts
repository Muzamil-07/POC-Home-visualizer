import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateEditToken, hashEditToken } from "@/lib/edit-token";
import {
  MAX_TOUR_JSON_BYTES,
  normalizePublishedTourData,
  publishTourRequestSchema,
} from "@/lib/tour-schema";
import { DAY_ENVIRONMENT } from "@/lib/lighting";
import { createTourSlug } from "@/lib/tour-slug";
import {
  createServiceSupabase,
  publicShareUrl,
} from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function fromZod(error: ZodError) {
  const first = error.issues[0];
  return first?.message || "Tour payload is invalid.";
}

export async function POST(request: Request) {
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

  const tourData = normalizePublishedTourData(parsed.data.tourData);
  const editToken = generateEditToken();
  const editTokenHash = hashEditToken(editToken);
  const uniqueness = randomBytes(3).toString("hex");
  let slug = createTourSlug(parsed.data.title, uniqueness);
  let attempts = 0;

  while (attempts < 6) {
    const { error } = await supabase.from("tours").insert({
      slug,
      title: parsed.data.title,
      model_url: tourData.model.url,
      model_fingerprint: tourData.model.fingerprint ?? null,
      tour_data: tourData,
      default_environment: DAY_ENVIRONMENT,
      allow_environment_switch: false,
      is_published: parsed.data.isPublished,
      edit_token_hash: editTokenHash,
      schema_version: tourData.schemaVersion,
    });

    if (!error) {
      const { data } = await supabase
        .from("tours")
        .select("id, slug")
        .eq("slug", slug)
        .single();
      if (!data) {
        return errorResponse("Tour was created but could not be loaded.", 500);
      }
      return NextResponse.json({
        id: data.id,
        slug: data.slug,
        editToken,
        shareUrl: publicShareUrl(data.slug, request),
      });
    }

    if (error.code === "23505") {
      attempts += 1;
      slug = createTourSlug(parsed.data.title, randomBytes(3).toString("hex"));
      continue;
    }

    console.error("[tours] create failed", error.code, error.message);
    if (error.code === "PGRST205") {
      return errorResponse(
        "The tours table is missing in Supabase. Run supabase/migrations/001_create_tours.sql in the SQL Editor, then try again.",
        500,
      );
    }
    return errorResponse(
      error.message
        ? `Couldn't publish this tour (${error.code ?? "unknown"}): ${error.message}`
        : "Couldn't publish this tour.",
      500,
    );
  }

  return errorResponse("Couldn't allocate a unique share URL.", 500);
}
