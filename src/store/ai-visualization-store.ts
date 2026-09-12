import type {
  AiGenerationStatus,
  AiVisualizationMessage,
} from "@/types/ai-visualization";
import { generationStatusLabel } from "@/lib/ai-visualization";

export type AiVisualizationState = {
  open: boolean;
  enabled: boolean;
  tourSlug: string;
  threadId: string | null;
  messages: AiVisualizationMessage[];
  status: AiGenerationStatus;
  statusLabel: string;
  error: string | null;
  busy: boolean;
  followUpsRemaining: number;
  unlimited: boolean;
  openaiKeySaved: boolean;
  openaiKeyLast4: string | null;
  needsOpenAiKey: boolean;
  originalCaptureUrl: string | null;
  compareImageUrl: string | null;
  lastCapture: {
    base64: string;
    mimeType: "image/jpeg";
    width: number;
    height: number;
    camera: AiVisualizationMessage["camera"];
  } | null;
};

type Listener = (state: AiVisualizationState) => void;

const initial: AiVisualizationState = {
  open: false,
  enabled: true,
  tourSlug: "",
  threadId: null,
  messages: [],
  status: "idle",
  statusLabel: "",
  error: null,
  busy: false,
  followUpsRemaining: 10,
  unlimited: false,
  openaiKeySaved: false,
  openaiKeyLast4: null,
  needsOpenAiKey: false,
  originalCaptureUrl: null,
  compareImageUrl: null,
  lastCapture: null,
};

let current: AiVisualizationState = { ...initial };
const listeners = new Set<Listener>();

export function getAiVisualization() {
  return current;
}

export function subscribeAiVisualization(listener: Listener) {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export function setAiVisualization(patch: Partial<AiVisualizationState>) {
  const nextStatus = patch.status ?? current.status;
  current = {
    ...current,
    ...patch,
    statusLabel:
      patch.statusLabel ??
      (patch.status ? generationStatusLabel(nextStatus) : current.statusLabel),
  };
  for (const listener of listeners) listener(current);
}

export function resetAiVisualization(enabled = true) {
  current = { ...initial, enabled };
  for (const listener of listeners) listener(current);
}

export function applyVisitorKeyStatus(input: {
  unlimited?: boolean;
  openaiKey?: { saved?: boolean; last4?: string | null } | null;
}) {
  setAiVisualization({
    unlimited: Boolean(input.unlimited || input.openaiKey?.saved),
    openaiKeySaved: Boolean(input.openaiKey?.saved),
    openaiKeyLast4: input.openaiKey?.last4 ?? null,
    needsOpenAiKey: input.openaiKey?.saved ? false : current.needsOpenAiKey,
  });
}

export function applyHydratedThread(input: {
  threadId: string;
  messages: AiVisualizationMessage[];
  followUpsRemaining: number;
  unlimited?: boolean;
  openaiKey?: { saved?: boolean; last4?: string | null } | null;
}) {
  const capture = [...input.messages]
    .reverse()
    .find((message) => message.type === "capture" && message.captureUrl);
  const latestImage = [...input.messages]
    .reverse()
    .find((message) => message.type === "image" && message.imageUrl);
  setAiVisualization({
    threadId: input.threadId,
    messages: input.messages,
    followUpsRemaining: input.unlimited ? 9999 : input.followUpsRemaining,
    unlimited: Boolean(input.unlimited || input.openaiKey?.saved),
    openaiKeySaved: input.openaiKey
      ? Boolean(input.openaiKey.saved)
      : current.openaiKeySaved,
    openaiKeyLast4: input.openaiKey
      ? input.openaiKey.last4 ?? null
      : current.openaiKeyLast4,
    needsOpenAiKey: input.openaiKey?.saved ? false : current.needsOpenAiKey,
    originalCaptureUrl: capture?.captureUrl ?? current.originalCaptureUrl,
    compareImageUrl: latestImage?.imageUrl ?? current.compareImageUrl,
    status: latestImage ? "ready" : current.status === "error" ? "error" : "ready",
    statusLabel: "",
    busy: false,
    error: null,
  });
}
