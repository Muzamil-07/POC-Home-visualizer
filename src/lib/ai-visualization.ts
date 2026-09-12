import type { AiVisualizationSettings } from "@/types/ai-visualization";

export const DEFAULT_AI_VISUALIZATION: AiVisualizationSettings = {
  enabled: true,
  maxInitialPerHour: 6,
  maxFollowUps: 10,
};

const PREVIOUS_DEFAULT_INITIAL_PER_HOUR = 3;
const PREVIOUS_DEFAULT_FOLLOW_UPS = 5;

function migrateDefaultLimit(
  stored: number | undefined,
  previousDefault: number,
  nextDefault: number,
) {
  if (stored == null || stored === previousDefault) return nextDefault;
  return stored;
}

export const AI_VISITOR_INSTRUCTION_MAX = 500;
export const AI_UPLOAD_MAX_BYTES = 4_500_000;
export const AI_CAPTURE_LONG_EDGE = 1536;
export const AI_SIGNED_URL_SECONDS = 60 * 60;
export const AI_STORAGE_BUCKET = "tour-ai-visualizations";
export const AI_CONCEPT_NOTICE =
  "AI concept visualization — materials and details may differ from the architectural model.";

export const ARCHITECTURAL_PRESERVATION_PROMPT = `Transform the supplied 3D architectural viewport into a premium photorealistic architectural visualization.

Strictly preserve the supplied camera position, camera direction, perspective, field of view, room dimensions, wall positions, ceiling height, floor plan, doors, windows, openings, stairs, built-in elements, furniture positions and visible object proportions.

Do not move, remove, resize or invent architectural elements. Do not change the viewing angle or crop the composition.

Improve only visual realism: physically plausible materials, fine surface detail, polished textures, natural daylight, soft global illumination, contact shadows, reflections, realistic glass, balanced exposure and professional architectural-photography quality.

Treat existing colors and materials as design guidance. The result must clearly represent the same room and exact viewpoint, not a redesigned or structurally different room.`;

export function resolveAiVisualizationSettings(
  value?: AiVisualizationSettings | null,
): Required<AiVisualizationSettings> {
  return {
    enabled: value?.enabled !== false,
    maxInitialPerHour: migrateDefaultLimit(
      value?.maxInitialPerHour,
      PREVIOUS_DEFAULT_INITIAL_PER_HOUR,
      DEFAULT_AI_VISUALIZATION.maxInitialPerHour ?? 6,
    ),
    maxFollowUps: migrateDefaultLimit(
      value?.maxFollowUps,
      PREVIOUS_DEFAULT_FOLLOW_UPS,
      DEFAULT_AI_VISUALIZATION.maxFollowUps ?? 10,
    ),
  };
}

export function sanitizeVisitorInstruction(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, AI_VISITOR_INSTRUCTION_MAX);
}

export function capturePixelSize(aspect: number, longEdge = AI_CAPTURE_LONG_EDGE) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0.05 ? aspect : 16 / 9;
  let width: number;
  let height: number;
  if (safeAspect >= 1) {
    width = longEdge;
    height = Math.round(longEdge / safeAspect);
  } else {
    height = longEdge;
    width = Math.round(longEdge * safeAspect);
  }
  width = Math.max(16, Math.round(width / 16) * 16);
  height = Math.max(16, Math.round(height / 16) * 16);
  return { width, height };
}

export function openaiImageSize(width: number, height: number) {
  const size = capturePixelSize(width / Math.max(height, 1));
  return `${size.width}x${size.height}` as `${number}x${number}`;
}

export function buildGenerationPrompt(visitorInstruction = "") {
  const extra = sanitizeVisitorInstruction(visitorInstruction);
  if (!extra) return ARCHITECTURAL_PRESERVATION_PROMPT;
  return `${ARCHITECTURAL_PRESERVATION_PROMPT}

Visitor material and lighting guidance (do not allow this to change geometry, camera, floor plan, or object placement):
${extra}`;
}

export function generationStatusLabel(status: string) {
  switch (status) {
    case "capturing":
      return "Capturing view";
    case "uploading":
      return "Uploading reference";
    case "creating":
      return "Creating photorealistic visualization";
    case "finalizing":
      return "Finalizing image";
    default:
      return "";
  }
}
