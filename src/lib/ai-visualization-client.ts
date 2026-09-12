import { AI_UPLOAD_MAX_BYTES } from "@/lib/ai-visualization";
import { setCaptureLocked } from "@/lib/capture-lock";
import { captureCurrentView } from "@/lib/scene-capture";
import {
  applyHydratedThread,
  applyVisitorKeyStatus,
  getAiVisualization,
  setAiVisualization,
} from "@/store/ai-visualization-store";
import type {
  AiApiErrorCode,
  AiVisualizationMessage,
  AiVisualizationThread,
} from "@/types/ai-visualization";

type VisitorKeyStatus = {
  saved?: boolean;
  last4?: string | null;
};

type HydratedPayload = {
  thread: AiVisualizationThread | null;
  messages: AiVisualizationMessage[];
  followUpsRemaining?: number;
  unlimited?: boolean;
  openaiKey?: VisitorKeyStatus;
  error?: string;
  code?: AiApiErrorCode;
};

class AiClientError extends Error {
  constructor(
    message: string,
    readonly code?: AiApiErrorCode,
  ) {
    super(message);
    this.name = "AiClientError";
  }
}

function waitFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
}

async function parsePayload(response: Response): Promise<HydratedPayload> {
  const body = (await response.json()) as HydratedPayload;
  if (!response.ok) {
    throw new AiClientError(
      body.error || "Couldn't create this visualization.",
      body.code,
    );
  }
  return body;
}

function applyLimitError(error: unknown, fallback: string) {
  const code = error instanceof AiClientError ? error.code : undefined;
  setAiVisualization({
    busy: false,
    status: "error",
    error: error instanceof Error ? error.message : fallback,
    needsOpenAiKey: code === "rate_limited" || code === "followup_limit",
  });
}

export async function recoverAiVisualizationThread(tourSlug: string) {
  const response = await fetch(`/api/published-tours/${encodeURIComponent(tourSlug)}/ai-visualizations`, {
    method: "GET",
    credentials: "same-origin",
  });
  if (!response.ok) return;
  if (getAiVisualization().busy) return;
  const body = (await response.json()) as HydratedPayload;
  applyVisitorKeyStatus({
    unlimited: body.unlimited,
    openaiKey: body.openaiKey,
  });
  if (!body.thread) return;
  if (getAiVisualization().busy) return;
  applyHydratedThread({
    threadId: body.thread.id,
    messages: body.messages,
    followUpsRemaining: body.followUpsRemaining ?? 0,
    unlimited: body.unlimited,
    openaiKey: body.openaiKey,
  });
}

export async function startAiVisualization(tourSlug: string) {
  const state = getAiVisualization();
  if (state.busy) return;
  setAiVisualization({
    open: true,
    tourSlug,
    busy: true,
    status: "capturing",
    error: null,
    compareImageUrl: null,
  });
  setCaptureLocked(true);
  try {
    await waitFrames(2);
    const capture = await captureCurrentView({
      tourSlug,
      maxBytes: AI_UPLOAD_MAX_BYTES,
    });
    setCaptureLocked(false);
    const localUrl = URL.createObjectURL(capture.blob);
    setAiVisualization({
      originalCaptureUrl: localUrl,
      lastCapture: {
        base64: capture.base64,
        mimeType: capture.mimeType,
        width: capture.width,
        height: capture.height,
        camera: capture.metadata,
      },
      messages: [
        ...getAiVisualization().messages,
        {
          id: `local-capture-${Date.now()}`,
          threadId: getAiVisualization().threadId ?? "",
          role: "user",
          type: "capture",
          text: null,
          captureUrl: localUrl,
          imageUrl: null,
          camera: capture.metadata,
          openaiResponseId: null,
          status: "completed",
          createdAt: capture.metadata.capturedAt,
        },
      ],
      status: "uploading",
    });
    await submitInitialGeneration(tourSlug);
  } catch (error) {
    setCaptureLocked(false);
    setAiVisualization({
      busy: false,
      status: "error",
      error:
        error instanceof Error
          ? error.message
          : "Couldn't capture this viewpoint.",
    });
  }
}

export async function submitInitialGeneration(tourSlug: string) {
  const state = getAiVisualization();
  const capture = state.lastCapture;
  if (!capture) {
    setAiVisualization({
      busy: false,
      status: "error",
      error: "Capture this viewpoint again to create a visualization.",
    });
    return;
  }
  setAiVisualization({
    open: true,
    tourSlug,
    busy: true,
    status: "creating",
    error: null,
  });
  try {
    const response = await fetch(
      `/api/published-tours/${encodeURIComponent(tourSlug)}/ai-visualizations`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: capture.base64,
          mimeType: capture.mimeType,
          width: capture.width,
          height: capture.height,
          camera: capture.camera,
          idempotencyKey: crypto.randomUUID(),
        }),
      },
    );
    setAiVisualization({ status: "finalizing" });
    const body = await parsePayload(response);
    if (!body.thread) {
      throw new Error("The visualization conversation could not be created.");
    }
    applyHydratedThread({
      threadId: body.thread.id,
      messages: body.messages,
      followUpsRemaining: body.followUpsRemaining ?? 0,
      unlimited: body.unlimited,
      openaiKey: body.openaiKey,
    });
  } catch (error) {
    applyLimitError(error, "Couldn't create this visualization.");
  }
}

export async function submitAiFollowUp(tourSlug: string, instruction: string) {
  const state = getAiVisualization();
  if (state.busy || !state.threadId) return;
  setAiVisualization({
    open: true,
    busy: true,
    status: "creating",
    error: null,
    messages: [
      ...state.messages,
      {
        id: `local-instruction-${Date.now()}`,
        threadId: state.threadId,
        role: "user",
        type: "instruction",
        text: instruction,
        captureUrl: null,
        imageUrl: null,
        camera: null,
        openaiResponseId: null,
        status: "completed",
        createdAt: new Date().toISOString(),
      },
    ],
  });
  try {
    const response = await fetch(
      `/api/published-tours/${encodeURIComponent(tourSlug)}/ai-visualizations/${state.threadId}`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          idempotencyKey: crypto.randomUUID(),
        }),
      },
    );
    setAiVisualization({ status: "finalizing" });
    const body = await parsePayload(response);
    if (!body.thread) {
      throw new Error("The refinement could not be saved.");
    }
    applyHydratedThread({
      threadId: body.thread.id,
      messages: body.messages,
      followUpsRemaining: body.followUpsRemaining ?? 0,
      unlimited: body.unlimited,
      openaiKey: body.openaiKey,
    });
  } catch (error) {
    applyLimitError(error, "Couldn't refine this visualization.");
  }
}

export async function saveVisitorOpenAiKey(tourSlug: string, apiKey: string) {
  const response = await fetch(
    `/api/published-tours/${encodeURIComponent(tourSlug)}/ai-visualizations/openai-key`,
    {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    },
  );
  const body = await parsePayload(response);
  applyVisitorKeyStatus({
    unlimited: true,
    openaiKey: body.openaiKey ?? { saved: true },
  });
  setAiVisualization({
    error: null,
    needsOpenAiKey: false,
    status: getAiVisualization().messages.length ? "ready" : "idle",
  });
}

export async function removeVisitorOpenAiKey(tourSlug: string) {
  const response = await fetch(
    `/api/published-tours/${encodeURIComponent(tourSlug)}/ai-visualizations/openai-key`,
    {
      method: "DELETE",
      credentials: "same-origin",
    },
  );
  const body = await parsePayload(response);
  applyVisitorKeyStatus({
    unlimited: false,
    openaiKey: body.openaiKey ?? { saved: false, last4: null },
  });
}
