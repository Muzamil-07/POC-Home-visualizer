export type CaptureMetadata = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  fov: number;
  aspect: number;
  tourSlug: string;
  capturedAt: string;
};

export type AiVisualizationSettings = {
  enabled: boolean;
  maxInitialPerHour?: number;
  maxFollowUps?: number;
};

export type AiMessageRole = "user" | "assistant";
export type AiMessageType = "capture" | "instruction" | "image" | "text" | "error";
export type AiMessageStatus = "pending" | "completed" | "failed";

export type AiVisualizationMessage = {
  id: string;
  threadId: string;
  role: AiMessageRole;
  type: AiMessageType;
  text: string | null;
  captureUrl: string | null;
  imageUrl: string | null;
  camera: CaptureMetadata | null;
  openaiResponseId: string | null;
  status: AiMessageStatus;
  createdAt: string;
};

export type AiVisualizationThread = {
  id: string;
  tourId: string;
  latestOpenaiResponseId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiGenerationStatus =
  | "idle"
  | "capturing"
  | "uploading"
  | "creating"
  | "finalizing"
  | "ready"
  | "error";

export type AiApiErrorCode =
  | "disabled"
  | "unpublished"
  | "not_configured"
  | "invalid_api_key"
  | "rate_limited"
  | "followup_limit"
  | "invalid_image"
  | "invalid_prompt"
  | "payload_too_large"
  | "timeout"
  | "openai_refused"
  | "openai_failed"
  | "duplicate"
  | "not_found"
  | "migration_missing"
  | "unknown";
