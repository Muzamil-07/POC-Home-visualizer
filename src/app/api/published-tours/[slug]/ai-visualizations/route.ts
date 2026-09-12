import { NextResponse } from "next/server";
import { AI_UPLOAD_MAX_BYTES } from "@/lib/ai-visualization";
import { getOpenAiConfig } from "@/lib/ai-openai";
import {
  clientIpFromRequest,
  hashIpSignal,
  withVisitorCookie,
} from "@/lib/ai-visitor";
import {
  loadVisitorOpenAiKey,
  loadVisitorOpenAiKeyMeta,
  withVisitorBilling,
} from "@/lib/ai-openai-key-store";
import {
  AiVisualizationError,
  createInitialVisualization,
  hydrateVisitorConversation,
  loadPublishedTourForAi,
} from "@/lib/ai-visualization-service";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_BODY_CHARS = Math.ceil(AI_UPLOAD_MAX_BYTES * 1.4) + 8_000;

function jsonError(error: unknown) {
  if (error instanceof AiVisualizationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("[ai-visualizations]", error instanceof Error ? error.message : "unknown");
  return NextResponse.json(
    { error: "Couldn't create this visualization.", code: "unknown" },
    { status: 500 },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  try {
    const visitorId = await withVisitorCookie();
    const supabase = createServiceSupabase();
    const tour = await loadPublishedTourForAi(supabase, slug);
    const keyMeta = await loadVisitorOpenAiKeyMeta(supabase, visitorId);
    const hydrated = await hydrateVisitorConversation(
      supabase,
      tour.id,
      visitorId,
      tour.settings.maxFollowUps,
    );
    if (!hydrated) {
      return NextResponse.json(
        withVisitorBilling(
          {
            thread: null,
            messages: [],
            followUpsRemaining: tour.settings.maxFollowUps,
          },
          keyMeta,
        ),
      );
    }
    return NextResponse.json(withVisitorBilling(hydrated, keyMeta));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json(
      { error: "The captured view is too large to upload.", code: "payload_too_large" },
      { status: 413 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON.", code: "unknown" },
      { status: 400 },
    );
  }

  const body = json as {
    imageBase64?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    camera?: unknown;
    instruction?: string;
    idempotencyKey?: string;
  };

  try {
    const visitorId = await withVisitorCookie();
    const supabase = createServiceSupabase();
    const visitorKey = await loadVisitorOpenAiKey(supabase, visitorId);
    const apiKey = visitorKey?.apiKey || getOpenAiConfig().apiKey;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "AI Visualization is not configured. Add your OpenAI API key, or set OPENAI_API_KEY on the server.",
          code: "not_configured",
        },
        { status: 503 },
      );
    }
    const tour = await loadPublishedTourForAi(supabase, slug);
    const hydrated = await createInitialVisualization({
      supabase,
      tourId: tour.id,
      visitorId,
      ipHash: hashIpSignal(clientIpFromRequest(request)),
      settings: tour.settings,
      imageBase64: body.imageBase64 || "",
      mimeType: body.mimeType || "image/jpeg",
      width: Number(body.width) || 0,
      height: Number(body.height) || 0,
      camera: body.camera,
      instruction: body.instruction,
      idempotencyKey: body.idempotencyKey || "",
      apiKey,
      bypassLimits: Boolean(visitorKey),
    });
    return NextResponse.json(
      withVisitorBilling(hydrated, visitorKey ? { last4: visitorKey.last4 } : null),
    );
  } catch (error) {
    return jsonError(error);
  }
}
