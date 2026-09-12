import { NextResponse } from "next/server";
import { getOpenAiConfig } from "@/lib/ai-openai";
import {
  clientIpFromRequest,
  hashIpSignal,
  withVisitorCookie,
} from "@/lib/ai-visitor";
import { loadVisitorOpenAiKey, withVisitorBilling } from "@/lib/ai-openai-key-store";
import {
  AiVisualizationError,
  continueVisualization,
  loadPublishedTourForAi,
} from "@/lib/ai-visualization-service";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

function jsonError(error: unknown) {
  if (error instanceof AiVisualizationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("[ai-visualizations]", error instanceof Error ? error.message : "unknown");
  return NextResponse.json(
    { error: "Couldn't refine this visualization.", code: "unknown" },
    { status: 500 },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; threadId: string }> },
) {
  const { slug, threadId } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON.", code: "unknown" },
      { status: 400 },
    );
  }
  const body = json as { instruction?: string; idempotencyKey?: string };

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
    const hydrated = await continueVisualization({
      supabase,
      tourId: tour.id,
      visitorId,
      ipHash: hashIpSignal(clientIpFromRequest(request)),
      threadId,
      settings: tour.settings,
      instruction: body.instruction || "",
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
