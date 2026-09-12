import type { ModelSource, ModelStats } from "@/components/viewer/glb";
import { createModelIdentity } from "@/types/tour";
import { DAY_ENVIRONMENT } from "@/lib/lighting";
import { DEFAULT_NAVIGATION } from "@/lib/exploration";
import { DEFAULT_AI_VISUALIZATION } from "@/lib/ai-visualization";
import { PUBLISHED_TOUR_SCHEMA_VERSION } from "@/lib/tour-schema";
import type { AiVisualizationSettings } from "@/types/ai-visualization";
import {
  DEFAULT_GROUND_COLOR,
  DEFAULT_GROUND_SIZE_MULTIPLIER,
  fallbackSiteGradeY,
  type GroundSettings,
} from "@/lib/ground";
import {
  normalizePublishedTourData,
  publishedTourDataInnerSchema,
  type PublishedTourData,
} from "@/lib/tour-schema";
import type { TourViewpoint } from "@/types/tour";
import { publishedHouseModelUrl } from "@/lib/house-model";

export const BLOB_MODEL_MESSAGE =
  "This model only exists in your browser. Load it from a public model URL before publishing.";

export function publicModelUrlFromSource(source: ModelSource | null) {
  if (!source) return "";
  return source.url;
}

export function isPublishableModelUrl(url: string) {
  if (!url) return false;
  if (url.startsWith("blob:") || url.startsWith("file:")) return false;
  return (
    url.startsWith("/") ||
    url.startsWith("https://") ||
    url.startsWith("http://")
  );
}

export function modelFingerprint(source: ModelSource | null) {
  if (!source) return "";
  return createModelIdentity({
    filename: source.filename,
    fileSize: source.fileSize,
    lastModified: source.lastModified,
  });
}

function defaultGround(stats: ModelStats, ground?: GroundSettings): GroundSettings {
  return {
    enabled: true,
    siteGradeY:
      ground?.siteGradeY ?? fallbackSiteGradeY(0, stats.height),
    color: ground?.color ?? DEFAULT_GROUND_COLOR,
    sizeMultiplier: ground?.sizeMultiplier ?? DEFAULT_GROUND_SIZE_MULTIPLIER,
  };
}

export function buildPublishedTourData(input: {
  source: ModelSource;
  stats: ModelStats;
  viewpoints: TourViewpoint[];
  startViewpointId: string;
  ground?: GroundSettings | null;
  autoplayEnabled?: boolean;
  dwellTime?: number;
  transitionDuration?: number;
  aiVisualization?: AiVisualizationSettings | null;
}): PublishedTourData {
  const viewpoints = [...input.viewpoints]
    .sort((a, b) => a.order - b.order)
    .map((viewpoint, index) => ({
      id: viewpoint.id,
      order: index,
      name: viewpoint.name.trim() || `Viewpoint ${index + 1}`,
      description: viewpoint.description ?? "",
      position: viewpoint.position,
      quaternion: viewpoint.quaternion,
      target: viewpoint.target,
      fov: viewpoint.fov,
    }));
  const start =
    viewpoints.find((item) => item.id === input.startViewpointId) ?? viewpoints[0];
  if (!start) {
    throw new Error("A Start View is required before publishing.");
  }

  const offset = input.stats.normalizationOffset;
  const data: PublishedTourData = {
    schemaVersion: PUBLISHED_TOUR_SCHEMA_VERSION,
    model: {
      url: publishedHouseModelUrl(input.source.url),
      filename: input.source.filename,
      byteSize: input.source.fileSize ?? undefined,
      fingerprint: modelFingerprint(input.source),
      transform: {
        position: [offset.x, offset.y, offset.z],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      bounds: {
        min: [-input.stats.width / 2, 0, -input.stats.depth / 2],
        max: [
          input.stats.width / 2,
          input.stats.height,
          input.stats.depth / 2,
        ],
      },
    },
    startView: {
      id: start.id,
      name: start.name,
      position: start.position,
      quaternion: start.quaternion,
      target: start.target,
      fov: start.fov,
    },
    navigation: DEFAULT_NAVIGATION,
    viewpoints,
    player: {
      startViewpointId: start.id,
      transitionDuration: input.transitionDuration ?? 1.1,
      autoplayEnabled: false,
      dwellTime: input.dwellTime ?? 2.5,
    },
    scene: {
      environment: DAY_ENVIRONMENT,
      ground: defaultGround(input.stats, input.ground ?? undefined),
    },
    aiVisualization: {
      enabled: input.aiVisualization?.enabled !== false,
      maxInitialPerHour:
        input.aiVisualization?.maxInitialPerHour ??
        DEFAULT_AI_VISUALIZATION.maxInitialPerHour,
      maxFollowUps:
        input.aiVisualization?.maxFollowUps ?? DEFAULT_AI_VISUALIZATION.maxFollowUps,
    },
  };

  return publishedTourDataInnerSchema.parse(normalizePublishedTourData(data));
}

export async function hashPublishedSnapshot(data: PublishedTourData) {
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
