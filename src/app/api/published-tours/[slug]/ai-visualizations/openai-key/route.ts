import { NextResponse } from "next/server";
import { withVisitorCookie } from "@/lib/ai-visitor";
import {
  deleteVisitorOpenAiKey,
  loadVisitorOpenAiKeyMeta,
  saveVisitorOpenAiKey,
  visitorKeyPublicStatus,
} from "@/lib/ai-openai-key-store";
import { AiVisualizationError } from "@/lib/ai-visualization-service";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

function jsonError(error: unknown) {
  if (error instanceof AiVisualizationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("[ai-openai-key]", error instanceof Error ? error.message : "unknown");
  return NextResponse.json(
    { error: "Couldn't update the OpenAI key.", code: "unknown" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const visitorId = await withVisitorCookie();
    const supabase = createServiceSupabase();
    const meta = await loadVisitorOpenAiKeyMeta(supabase, visitorId);
    return NextResponse.json({
      openaiKey: visitorKeyPublicStatus(meta),
      unlimited: Boolean(meta),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON.", code: "unknown" },
      { status: 400 },
    );
  }
  const body = json as { apiKey?: unknown };
  try {
    const visitorId = await withVisitorCookie();
    const supabase = createServiceSupabase();
    const saved = await saveVisitorOpenAiKey(supabase, visitorId, body.apiKey);
    return NextResponse.json({
      openaiKey: visitorKeyPublicStatus(saved),
      unlimited: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE() {
  try {
    const visitorId = await withVisitorCookie();
    const supabase = createServiceSupabase();
    await deleteVisitorOpenAiKey(supabase, visitorId);
    return NextResponse.json({
      openaiKey: visitorKeyPublicStatus(null),
      unlimited: false,
    });
  } catch (error) {
    return jsonError(error);
  }
}
