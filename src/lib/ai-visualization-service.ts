import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_UPLOAD_MAX_BYTES,
  AI_VISITOR_INSTRUCTION_MAX,
  openaiImageSize,
  resolveAiVisualizationSettings,
  sanitizeVisitorInstruction,
} from "@/lib/ai-visualization";
import { generateArchitecturalImage, formatOpenAiError } from "@/lib/ai-openai";
import {
  signedVisualizationUrl,
  uploadVisualizationImage,
  visualizationObjectPath,
} from "@/lib/ai-storage";
import { parsePublishedTourData } from "@/lib/tour-schema";
import type {
  AiApiErrorCode,
  AiVisualizationMessage,
  AiVisualizationThread,
  CaptureMetadata,
} from "@/types/ai-visualization";

export class AiVisualizationError extends Error {
  constructor(
    message: string,
    readonly code: AiApiErrorCode,
    readonly status: number,
  ) {
    super(message);
    this.name = "AiVisualizationError";
  }
}

type ThreadRow = {
  id: string;
  tour_id: string;
  visitor_session_id: string;
  latest_openai_response_id: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  message_type: AiVisualizationMessage["type"];
  text_content: string | null;
  original_capture_path: string | null;
  generated_image_path: string | null;
  camera_metadata: CaptureMetadata | null;
  openai_response_id: string | null;
  status: AiVisualizationMessage["status"];
  created_at: string;
};

export type HydratedThread = {
  thread: AiVisualizationThread;
  messages: AiVisualizationMessage[];
  followUpsRemaining: number;
  unlimited?: boolean;
  openaiKey?: { saved: boolean; last4: string | null };
};

function mapMissingTable(error: { code?: string; message?: string } | null) {
  if (
    error?.code === "PGRST205" ||
    error?.message?.includes("ai_visualization") ||
    error?.message?.includes("ai_visitor_openai")
  ) {
    return new AiVisualizationError(
      "AI Visualization tables are missing in Supabase. Run supabase/migrations/002_ai_visualizations.sql in the SQL Editor.",
      "migration_missing",
      503,
    );
  }
  return null;
}

function asThread(row: ThreadRow): AiVisualizationThread {
  return {
    id: row.id,
    tourId: row.tour_id,
    latestOpenaiResponseId: row.latest_openai_response_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function mapMessage(
  supabase: SupabaseClient,
  row: MessageRow,
): Promise<AiVisualizationMessage> {
  const [captureUrl, imageUrl] = await Promise.all([
    signedVisualizationUrl(supabase, row.original_capture_path),
    signedVisualizationUrl(supabase, row.generated_image_path),
  ]);
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    type: row.message_type,
    text: row.text_content,
    captureUrl,
    imageUrl,
    camera: row.camera_metadata,
    openaiResponseId: row.openai_response_id,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function loadPublishedTourForAi(
  supabase: SupabaseClient,
  slug: string,
) {
  const { data, error } = await supabase
    .from("tours")
    .select("id, slug, is_published, tour_data")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw (
      mapMissingTable(error) ||
      new AiVisualizationError("Couldn't load this tour.", "unknown", 500)
    );
  }
  if (!data) {
    throw new AiVisualizationError("Tour not found.", "not_found", 404);
  }
  if (!data.is_published) {
    throw new AiVisualizationError(
      "Only published tours can create AI visualizations.",
      "unpublished",
      403,
    );
  }
  const tourData = parsePublishedTourData(data.tour_data);
  const settings = resolveAiVisualizationSettings(tourData.aiVisualization);
  if (!settings.enabled) {
    throw new AiVisualizationError(
      "AI Visualization is turned off for this tour.",
      "disabled",
      403,
    );
  }
  return { id: data.id as string, slug: data.slug as string, settings };
}

export async function hydrateThread(
  supabase: SupabaseClient,
  thread: ThreadRow,
  maxFollowUps: number,
): Promise<HydratedThread> {
  const { data, error } = await supabase
    .from("ai_visualization_messages")
    .select(
      "id, thread_id, role, message_type, text_content, original_capture_path, generated_image_path, camera_metadata, openai_response_id, status, created_at",
    )
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });
  if (error) {
    throw (
      mapMissingTable(error) ||
      new AiVisualizationError("Couldn't load this conversation.", "unknown", 500)
    );
  }
  const messages = await Promise.all(
    (data ?? []).map((row) => mapMessage(supabase, row as MessageRow)),
  );
  const followUpsUsed = messages.filter(
    (message) => message.role === "user" && message.type === "instruction",
  ).length;
  return {
    thread: asThread(thread),
    messages,
    followUpsRemaining: Math.max(0, maxFollowUps - followUpsUsed),
  };
}

export async function loadVisitorThreads(
  supabase: SupabaseClient,
  tourId: string,
  visitorId: string,
) {
  const { data, error } = await supabase
    .from("ai_visualization_threads")
    .select(
      "id, tour_id, visitor_session_id, latest_openai_response_id, created_at, updated_at",
    )
    .eq("tour_id", tourId)
    .eq("visitor_session_id", visitorId)
    .order("created_at", { ascending: true });
  if (error) {
    throw (
      mapMissingTable(error) ||
      new AiVisualizationError("Couldn't load this conversation.", "unknown", 500)
    );
  }
  return (data ?? []) as ThreadRow[];
}

export async function hydrateVisitorConversation(
  supabase: SupabaseClient,
  tourId: string,
  visitorId: string,
  maxFollowUps: number,
): Promise<HydratedThread | null> {
  const threads = await loadVisitorThreads(supabase, tourId, visitorId);
  if (!threads.length) return null;
  const { data, error } = await supabase
    .from("ai_visualization_messages")
    .select(
      "id, thread_id, role, message_type, text_content, original_capture_path, generated_image_path, camera_metadata, openai_response_id, status, created_at",
    )
    .in(
      "thread_id",
      threads.map((thread) => thread.id),
    )
    .order("created_at", { ascending: true });
  if (error) {
    throw (
      mapMissingTable(error) ||
      new AiVisualizationError("Couldn't load this conversation.", "unknown", 500)
    );
  }
  const messages = await Promise.all(
    (data ?? []).map((row) => mapMessage(supabase, row as MessageRow)),
  );
  const followUpsUsed = messages.filter(
    (message) => message.role === "user" && message.type === "instruction",
  ).length;
  const latest = threads.reduce((current, next) =>
    next.updated_at > current.updated_at ? next : current,
  );
  return {
    thread: asThread(latest),
    messages,
    followUpsRemaining: Math.max(0, maxFollowUps - followUpsUsed),
  };
}

async function requireVisitorConversation(
  supabase: SupabaseClient,
  tourId: string,
  visitorId: string,
  maxFollowUps: number,
) {
  const conversation = await hydrateVisitorConversation(
    supabase,
    tourId,
    visitorId,
    maxFollowUps,
  );
  if (!conversation) {
    throw new AiVisualizationError("Couldn't load this conversation.", "unknown", 500);
  }
  return conversation;
}

export async function loadVisitorThread(
  supabase: SupabaseClient,
  tourId: string,
  visitorId: string,
) {
  const { data, error } = await supabase
    .from("ai_visualization_threads")
    .select(
      "id, tour_id, visitor_session_id, latest_openai_response_id, created_at, updated_at",
    )
    .eq("tour_id", tourId)
    .eq("visitor_session_id", visitorId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw (
      mapMissingTable(error) ||
      new AiVisualizationError("Couldn't load this conversation.", "unknown", 500)
    );
  }
  return (data as ThreadRow | null) ?? null;
}

async function loadUsageByIdempotency(
  supabase: SupabaseClient,
  visitorId: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase
    .from("ai_generation_usage")
    .select("id, thread_id")
    .eq("visitor_session_id", visitorId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) {
    throw (
      mapMissingTable(error) ||
      new AiVisualizationError("Couldn't check this request.", "unknown", 500)
    );
  }
  return data;
}

async function countUsage(
  supabase: SupabaseClient,
  query: {
    tourId: string;
    visitorId?: string;
    ipHash?: string | null;
    threadId?: string;
    kind: "initial" | "followup";
    sinceHours?: number;
  },
) {
  let builder = supabase
    .from("ai_generation_usage")
    .select("id", { count: "exact", head: true })
    .eq("tour_id", query.tourId)
    .eq("kind", query.kind);
  if (query.visitorId) builder = builder.eq("visitor_session_id", query.visitorId);
  if (query.ipHash) builder = builder.eq("ip_hash", query.ipHash);
  if (query.threadId) builder = builder.eq("thread_id", query.threadId);
  if (query.sinceHours) {
    const since = new Date(Date.now() - query.sinceHours * 60 * 60 * 1000).toISOString();
    builder = builder.gte("created_at", since);
  }
  const { count, error } = await builder;
  if (error) {
    throw (
      mapMissingTable(error) ||
      new AiVisualizationError("Couldn't check usage limits.", "unknown", 500)
    );
  }
  return count ?? 0;
}

async function insertUsage(
  supabase: SupabaseClient,
  row: {
    tourId: string;
    visitorId: string;
    ipHash: string | null;
    kind: "initial" | "followup";
    threadId: string | null;
    idempotencyKey: string;
  },
) {
  const { error } = await supabase.from("ai_generation_usage").insert({
    tour_id: row.tourId,
    visitor_session_id: row.visitorId,
    ip_hash: row.ipHash,
    kind: row.kind,
    thread_id: row.threadId,
    idempotency_key: row.idempotencyKey,
  });
  if (error?.code === "23505") {
    return "duplicate" as const;
  }
  if (error) {
    throw (
      mapMissingTable(error) ||
      new AiVisualizationError("Couldn't record generation usage.", "unknown", 500)
    );
  }
  return "created" as const;
}

async function deleteUsage(
  supabase: SupabaseClient,
  visitorId: string,
  idempotencyKey: string,
) {
  await supabase
    .from("ai_generation_usage")
    .delete()
    .eq("visitor_session_id", visitorId)
    .eq("idempotency_key", idempotencyKey);
}

export async function decodeAndValidateCapture(input: {
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
}) {
  if (input.mimeType !== "image/jpeg" && input.mimeType !== "image/png") {
    throw new AiVisualizationError(
      "The captured view must be a JPEG or PNG image.",
      "invalid_image",
      400,
    );
  }
  const raw = input.imageBase64.includes(",")
    ? input.imageBase64.slice(input.imageBase64.indexOf(",") + 1)
    : input.imageBase64;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(raw, "base64");
  } catch {
    throw new AiVisualizationError(
      "The captured view could not be decoded.",
      "invalid_image",
      400,
    );
  }
  if (!bytes.length || bytes.length > AI_UPLOAD_MAX_BYTES) {
    throw new AiVisualizationError(
      "The captured view is too large to upload.",
      "payload_too_large",
      413,
    );
  }
  let meta: { width?: number; height?: number; format?: string };
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    throw new AiVisualizationError(
      "The captured view is not a valid image.",
      "invalid_image",
      400,
    );
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 16 || height < 16 || width > 4096 || height > 4096) {
    throw new AiVisualizationError(
      "The captured view has an unsupported size.",
      "invalid_image",
      400,
    );
  }
  return {
    bytes,
    mimeType: (meta.format === "png" ? "image/png" : "image/jpeg") as
      | "image/jpeg"
      | "image/png",
    width,
    height,
    dataUrl: `data:${input.mimeType};base64,${bytes.toString("base64")}`,
  };
}

function validateCamera(value: unknown): CaptureMetadata {
  const camera = value as CaptureMetadata | null;
  if (
    !camera ||
    !Array.isArray(camera.position) ||
    !Array.isArray(camera.quaternion) ||
    typeof camera.fov !== "number" ||
    typeof camera.aspect !== "number" ||
    typeof camera.tourSlug !== "string"
  ) {
    throw new AiVisualizationError(
      "Camera metadata is missing from this capture.",
      "invalid_image",
      400,
    );
  }
  return {
    position: [
      Number(camera.position[0]),
      Number(camera.position[1]),
      Number(camera.position[2]),
    ],
    quaternion: [
      Number(camera.quaternion[0]),
      Number(camera.quaternion[1]),
      Number(camera.quaternion[2]),
      Number(camera.quaternion[3]),
    ],
    fov: camera.fov,
    aspect: camera.aspect,
    tourSlug: camera.tourSlug,
    capturedAt:
      typeof camera.capturedAt === "string"
        ? camera.capturedAt
        : new Date().toISOString(),
  };
}

async function persistOpenAiResult(input: {
  supabase: SupabaseClient;
  tourId: string;
  visitorId: string;
  thread: ThreadRow;
  result: Awaited<ReturnType<typeof generateArchitecturalImage>>;
}) {
  const messageId = randomUUID();
  if (input.result.kind === "image") {
    const path = visualizationObjectPath({
      tourId: input.tourId,
      visitorId: input.visitorId,
      threadId: input.thread.id,
      messageId,
      kind: "generated",
      extension: input.result.mimeType === "image/png" ? "png" : "jpg",
    });
    await uploadVisualizationImage(
      input.supabase,
      path,
      input.result.bytes,
      input.result.mimeType,
    );
    const { error } = await input.supabase.from("ai_visualization_messages").insert({
      id: messageId,
      thread_id: input.thread.id,
      role: "assistant",
      message_type: "image",
      generated_image_path: path,
      openai_response_id: input.result.responseId,
      status: "completed",
    });
    if (error) {
      throw new AiVisualizationError(
        "The image was created but could not be saved.",
        "unknown",
        500,
      );
    }
  } else {
    const { error } = await input.supabase.from("ai_visualization_messages").insert({
      id: messageId,
      thread_id: input.thread.id,
      role: "assistant",
      message_type: "text",
      text_content: input.result.text,
      openai_response_id: input.result.responseId,
      status: "completed",
    });
    if (error) {
      throw new AiVisualizationError(
        "The model response could not be saved.",
        "unknown",
        500,
      );
    }
  }

  await input.supabase
    .from("ai_visualization_threads")
    .update({
      latest_openai_response_id: input.result.responseId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.thread.id);
}

export async function createInitialVisualization(input: {
  supabase: SupabaseClient;
  tourId: string;
  visitorId: string;
  ipHash: string | null;
  settings: ReturnType<typeof resolveAiVisualizationSettings>;
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
  camera: unknown;
  instruction?: string;
  idempotencyKey: string;
  apiKey?: string;
  bypassLimits?: boolean;
}) {
  if (!input.idempotencyKey || input.idempotencyKey.length > 80) {
    throw new AiVisualizationError(
      "A valid idempotency key is required.",
      "unknown",
      400,
    );
  }
  const existing = await loadUsageByIdempotency(
    input.supabase,
    input.visitorId,
    input.idempotencyKey,
  );
  if (existing?.thread_id) {
    const { data: thread } = await input.supabase
      .from("ai_visualization_threads")
      .select(
        "id, tour_id, visitor_session_id, latest_openai_response_id, created_at, updated_at",
      )
      .eq("id", existing.thread_id)
      .maybeSingle();
    if (thread) {
      return requireVisitorConversation(
        input.supabase,
        input.tourId,
        input.visitorId,
        input.settings.maxFollowUps,
      );
    }
  }

  if (!input.bypassLimits) {
    const visitorCount = await countUsage(input.supabase, {
      tourId: input.tourId,
      visitorId: input.visitorId,
      kind: "initial",
      sinceHours: 1,
    });
    const ipCount = input.ipHash
      ? await countUsage(input.supabase, {
          tourId: input.tourId,
          ipHash: input.ipHash,
          kind: "initial",
          sinceHours: 1,
        })
      : 0;
    if (
      visitorCount >= input.settings.maxInitialPerHour ||
      ipCount >= input.settings.maxInitialPerHour
    ) {
      throw new AiVisualizationError(
        "This tour has reached its hourly visualization limit. Add your OpenAI API key to continue without limits, or try again later.",
        "rate_limited",
        429,
      );
    }
  }

  const inserted = await insertUsage(input.supabase, {
    tourId: input.tourId,
    visitorId: input.visitorId,
    ipHash: input.ipHash,
    kind: "initial",
    threadId: null,
    idempotencyKey: input.idempotencyKey,
  });
  if (inserted === "duplicate") {
    const again = await loadUsageByIdempotency(
      input.supabase,
      input.visitorId,
      input.idempotencyKey,
    );
    if (again?.thread_id) {
      const { data: thread } = await input.supabase
        .from("ai_visualization_threads")
        .select(
          "id, tour_id, visitor_session_id, latest_openai_response_id, created_at, updated_at",
        )
        .eq("id", again.thread_id)
        .maybeSingle();
      if (thread) {
        return requireVisitorConversation(
          input.supabase,
          input.tourId,
          input.visitorId,
          input.settings.maxFollowUps,
        );
      }
    }
    throw new AiVisualizationError(
      "This visualization request is already in progress.",
      "duplicate",
      409,
    );
  }

  if (!input.bypassLimits) {
    const afterInsert = await countUsage(input.supabase, {
      tourId: input.tourId,
      visitorId: input.visitorId,
      kind: "initial",
      sinceHours: 1,
    });
    if (afterInsert > input.settings.maxInitialPerHour) {
      await deleteUsage(input.supabase, input.visitorId, input.idempotencyKey);
      throw new AiVisualizationError(
        "This tour has reached its hourly visualization limit. Add your OpenAI API key to continue without limits, or try again later.",
        "rate_limited",
        429,
      );
    }
  }

  const capture = await decodeAndValidateCapture({
    imageBase64: input.imageBase64,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
  });
  const camera = validateCamera(input.camera);
  const instruction = sanitizeVisitorInstruction(input.instruction);
  if (typeof input.instruction === "string" && input.instruction.length > AI_VISITOR_INSTRUCTION_MAX + 20) {
    await deleteUsage(input.supabase, input.visitorId, input.idempotencyKey);
    throw new AiVisualizationError(
      `Visitor instructions must be ${AI_VISITOR_INSTRUCTION_MAX} characters or fewer.`,
      "invalid_prompt",
      400,
    );
  }

  const existingThread = await loadVisitorThread(
    input.supabase,
    input.tourId,
    input.visitorId,
  );
  const threadId = existingThread?.id ?? randomUUID();
  const captureMessageId = randomUUID();
  if (!existingThread) {
    const { error: threadError } = await input.supabase
      .from("ai_visualization_threads")
      .insert({
        id: threadId,
        tour_id: input.tourId,
        visitor_session_id: input.visitorId,
      });
    if (threadError) {
      await deleteUsage(input.supabase, input.visitorId, input.idempotencyKey);
      throw (
        mapMissingTable(threadError) ||
        new AiVisualizationError("Couldn't start this conversation.", "unknown", 500)
      );
    }
  }

  await input.supabase
    .from("ai_generation_usage")
    .update({ thread_id: threadId })
    .eq("visitor_session_id", input.visitorId)
    .eq("idempotency_key", input.idempotencyKey);

  const capturePath = visualizationObjectPath({
    tourId: input.tourId,
    visitorId: input.visitorId,
    threadId,
    messageId: captureMessageId,
    kind: "capture",
    extension: capture.mimeType === "image/png" ? "png" : "jpg",
  });
  try {
    await uploadVisualizationImage(
      input.supabase,
      capturePath,
      capture.bytes,
      capture.mimeType,
    );
    await input.supabase.from("ai_visualization_messages").insert({
      id: captureMessageId,
      thread_id: threadId,
      role: "user",
      message_type: "capture",
      text_content: instruction || null,
      original_capture_path: capturePath,
      camera_metadata: camera,
      status: "completed",
    });
  } catch (error) {
    await deleteUsage(input.supabase, input.visitorId, input.idempotencyKey);
    throw error instanceof AiVisualizationError
      ? error
      : new AiVisualizationError(
          error instanceof Error ? error.message : "Couldn't store the captured view.",
          "unknown",
          500,
        );
  }

  const { data: thread } = await input.supabase
    .from("ai_visualization_threads")
    .select(
      "id, tour_id, visitor_session_id, latest_openai_response_id, created_at, updated_at",
    )
    .eq("id", threadId)
    .single();

  try {
    const result = await generateArchitecturalImage({
      imageDataUrl: capture.dataUrl,
      size: openaiImageSize(capture.width, capture.height),
      visitorInstruction: instruction,
      apiKey: input.apiKey,
    });
    await persistOpenAiResult({
      supabase: input.supabase,
      tourId: input.tourId,
      visitorId: input.visitorId,
      thread: thread as ThreadRow,
      result,
    });
  } catch (error) {
    const message = formatOpenAiError(error);
    const code: AiApiErrorCode =
      /timeout|took too long/i.test(message) ? "timeout" : "openai_failed";
    await input.supabase.from("ai_visualization_messages").insert({
      thread_id: threadId,
      role: "assistant",
      message_type: "error",
      text_content: message,
      status: "failed",
    });
    if (code === "timeout") {
      throw new AiVisualizationError(message, code, 504);
    }
    throw new AiVisualizationError(message, code, 502);
  }

  const conversation = await hydrateVisitorConversation(
    input.supabase,
    input.tourId,
    input.visitorId,
    input.settings.maxFollowUps,
  );
  if (!conversation) {
    throw new AiVisualizationError("Couldn't load this conversation.", "unknown", 500);
  }
  return conversation;
}

export async function continueVisualization(input: {
  supabase: SupabaseClient;
  tourId: string;
  visitorId: string;
  ipHash: string | null;
  threadId: string;
  settings: ReturnType<typeof resolveAiVisualizationSettings>;
  instruction: string;
  idempotencyKey: string;
  apiKey?: string;
  bypassLimits?: boolean;
}) {
  const instruction = sanitizeVisitorInstruction(input.instruction);
  if (!instruction) {
    throw new AiVisualizationError(
      "Enter a short instruction to refine this visualization.",
      "invalid_prompt",
      400,
    );
  }
  if (!input.idempotencyKey || input.idempotencyKey.length > 80) {
    throw new AiVisualizationError(
      "A valid idempotency key is required.",
      "unknown",
      400,
    );
  }

  const existing = await loadUsageByIdempotency(
    input.supabase,
    input.visitorId,
    input.idempotencyKey,
  );
  if (existing?.thread_id === input.threadId) {
    const { data: thread } = await input.supabase
      .from("ai_visualization_threads")
      .select(
        "id, tour_id, visitor_session_id, latest_openai_response_id, created_at, updated_at",
      )
      .eq("id", input.threadId)
      .maybeSingle();
    if (thread) {
      return requireVisitorConversation(
        input.supabase,
        input.tourId,
        input.visitorId,
        input.settings.maxFollowUps,
      );
    }
  }

  const { data: thread, error } = await input.supabase
    .from("ai_visualization_threads")
    .select(
      "id, tour_id, visitor_session_id, latest_openai_response_id, created_at, updated_at",
    )
    .eq("id", input.threadId)
    .eq("tour_id", input.tourId)
    .eq("visitor_session_id", input.visitorId)
    .maybeSingle();
  if (error) {
    throw (
      mapMissingTable(error) ||
      new AiVisualizationError("Couldn't load this conversation.", "unknown", 500)
    );
  }
  if (!thread) {
    throw new AiVisualizationError("Conversation not found.", "not_found", 404);
  }
  if (!thread.latest_openai_response_id) {
    throw new AiVisualizationError(
      "This conversation does not have a previous visualization to edit.",
      "openai_failed",
      409,
    );
  }

  if (!input.bypassLimits) {
    const followUps = await countUsage(input.supabase, {
      tourId: input.tourId,
      threadId: input.threadId,
      kind: "followup",
    });
    if (followUps >= input.settings.maxFollowUps) {
      throw new AiVisualizationError(
        "This conversation has reached its follow-up limit. Add your OpenAI API key to continue without limits.",
        "followup_limit",
        429,
      );
    }
  }

  const inserted = await insertUsage(input.supabase, {
    tourId: input.tourId,
    visitorId: input.visitorId,
    ipHash: input.ipHash,
    kind: "followup",
    threadId: input.threadId,
    idempotencyKey: input.idempotencyKey,
  });
  if (inserted === "duplicate") {
    return requireVisitorConversation(
      input.supabase,
      input.tourId,
      input.visitorId,
      input.settings.maxFollowUps,
    );
  }

  if (!input.bypassLimits) {
    const afterInsert = await countUsage(input.supabase, {
      tourId: input.tourId,
      threadId: input.threadId,
      kind: "followup",
    });
    if (afterInsert > input.settings.maxFollowUps) {
      await deleteUsage(input.supabase, input.visitorId, input.idempotencyKey);
      throw new AiVisualizationError(
        "This conversation has reached its follow-up limit. Add your OpenAI API key to continue without limits.",
        "followup_limit",
        429,
      );
    }
  }

  await input.supabase.from("ai_visualization_messages").insert({
    thread_id: input.threadId,
    role: "user",
    message_type: "instruction",
    text_content: instruction,
    status: "completed",
  });

  try {
    const result = await generateArchitecturalImage({
      imageDataUrl: "",
      size: "auto",
      visitorInstruction: instruction,
      previousResponseId: thread.latest_openai_response_id,
      apiKey: input.apiKey,
    });
    await persistOpenAiResult({
      supabase: input.supabase,
      tourId: input.tourId,
      visitorId: input.visitorId,
      thread: thread as ThreadRow,
      result,
    });
  } catch (error) {
    const formatted = formatOpenAiError(error);
    const message = /timeout|took too long/i.test(formatted)
      ? "The refinement took too long. Please try again."
      : formatted;
    const code: AiApiErrorCode =
      /timeout|took too long/i.test(message) ? "timeout" : "openai_failed";
    await input.supabase.from("ai_visualization_messages").insert({
      thread_id: input.threadId,
      role: "assistant",
      message_type: "error",
      text_content: message,
      status: "failed",
    });
    throw new AiVisualizationError(message, code, code === "timeout" ? 504 : 502);
  }

  return requireVisitorConversation(
    input.supabase,
    input.tourId,
    input.visitorId,
    input.settings.maxFollowUps,
  );
}
