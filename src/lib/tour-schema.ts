import { z } from "zod";
import { DAY_ENVIRONMENT, type LightingMode } from "@/lib/lighting";
import {
  DEFAULT_GROUND_COLOR,
  DEFAULT_GROUND_SIZE_MULTIPLIER,
  fallbackSiteGradeY,
  type GroundSettings,
} from "@/lib/ground";
import { DEFAULT_NAVIGATION } from "@/lib/exploration";
import { DEFAULT_AI_VISUALIZATION } from "@/lib/ai-visualization";
import type { StartView } from "@/types/exploration";
import type { AiVisualizationSettings } from "@/types/ai-visualization";

export const MAX_TOUR_JSON_BYTES = 750_000;
export const PUBLISHED_TOUR_SCHEMA_VERSION = 3 as const;

const finiteNumber = z.number().finite();

export const vector3TupleSchema = z.tuple([
  finiteNumber,
  finiteNumber,
  finiteNumber,
]);

export const quaternionTupleSchema = z.tuple([
  finiteNumber,
  finiteNumber,
  finiteNumber,
  finiteNumber,
]);

const legacyLightingSchema = z.enum(["day", "evening", "night"]);

export const lightingModeSchema = z.literal(DAY_ENVIRONMENT);

const modelUrlSchema = z
  .string()
  .trim()
  .min(1, "Model URL is required.")
  .refine((value) => !value.startsWith("blob:") && !value.startsWith("file:"), {
    message:
      "This model only exists in your browser. Load it from a public model URL before publishing.",
  })
  .refine(
    (value) =>
      value.startsWith("/") ||
      value.startsWith("https://") ||
      value.startsWith("http://"),
    { message: "Model URL is unusable." },
  );

export const publishedViewpointSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000),
  position: vector3TupleSchema,
  quaternion: quaternionTupleSchema,
  target: vector3TupleSchema,
  fov: z.number().finite().min(20).max(100),
});

export const startViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  position: vector3TupleSchema,
  quaternion: quaternionTupleSchema,
  target: vector3TupleSchema,
  fov: z.number().finite().min(20).max(100),
});

export const navigationSettingsSchema = z.object({
  eyeHeight: z.number().finite().min(1.2).max(2.2),
  movementSpeed: z.number().finite().min(0.6).max(4),
  maximumClickDistance: z.number().finite().min(4).max(40),
  collisionRadius: z.number().finite().min(0.15).max(0.45),
});

export const sceneGroundSchema = z.object({
  enabled: z.literal(true),
  siteGradeY: z.number().finite(),
  color: z.string().min(1).max(32),
  sizeMultiplier: z.number().finite().min(2).max(40),
});

export const aiVisualizationSettingsSchema = z.object({
  enabled: z.boolean(),
  maxInitialPerHour: z.number().int().min(0).max(20).optional(),
  maxFollowUps: z.number().int().min(0).max(20).optional(),
});

export const publishedTourDataInnerSchema = z
  .object({
    schemaVersion: z.literal(PUBLISHED_TOUR_SCHEMA_VERSION),
    model: z.object({
      url: modelUrlSchema,
      filename: z.string().min(1).optional(),
      byteSize: z.number().finite().nonnegative().optional(),
      fingerprint: z.string().min(1).optional(),
      transform: z.object({
        position: vector3TupleSchema,
        rotation: vector3TupleSchema,
        scale: vector3TupleSchema,
      }),
      bounds: z
        .object({
          min: vector3TupleSchema,
          max: vector3TupleSchema,
        })
        .optional(),
    }),
    startView: startViewSchema,
    navigation: navigationSettingsSchema,
    viewpoints: z.array(publishedViewpointSchema).optional(),
    player: z
      .object({
        startViewpointId: z.string().min(1),
        transitionDuration: z.number().finite().min(0.2).max(8),
        autoplayEnabled: z.boolean(),
        dwellTime: z.number().finite().min(0.5).max(20),
      })
      .optional(),
    scene: z.object({
      environment: z.literal(DAY_ENVIRONMENT),
      ground: sceneGroundSchema,
    }),
    aiVisualization: aiVisualizationSettingsSchema,
  })
  .superRefine((value, ctx) => {
    const viewpoints = value.viewpoints ?? [];
    const ids = new Set<string>();
    const orders = new Set<number>();
    for (const viewpoint of viewpoints) {
      if (ids.has(viewpoint.id)) {
        ctx.addIssue({
          code: "custom",
          message: "Viewpoint IDs must be unique.",
          path: ["viewpoints"],
        });
        break;
      }
      ids.add(viewpoint.id);
      if (orders.has(viewpoint.order)) {
        ctx.addIssue({
          code: "custom",
          message: "Viewpoint order values must be unique.",
          path: ["viewpoints"],
        });
        break;
      }
      orders.add(viewpoint.order);
    }
  });

export const publishedTourDataSchema = z.preprocess(
  migratePublishedTourData,
  publishedTourDataInnerSchema,
);

export const publishTourRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  isPublished: z.boolean().default(true),
  defaultEnvironment: legacyLightingSchema.optional(),
  allowEnvironmentSwitch: z.boolean().optional(),
  tourData: publishedTourDataSchema,
});

export type Vector3Tuple = z.infer<typeof vector3TupleSchema>;
export type QuaternionTuple = z.infer<typeof quaternionTupleSchema>;
export type PublishedViewpoint = z.infer<typeof publishedViewpointSchema>;
export type PublishedStartView = z.infer<typeof startViewSchema>;
export type PublishedTourData = z.infer<typeof publishedTourDataInnerSchema>;
export type PublishTourRequest = z.infer<typeof publishTourRequestSchema>;

export type PublishedTourRecord = {
  id: string;
  slug: string;
  title: string;
  modelUrl: string;
  defaultEnvironment: LightingMode;
  allowEnvironmentSwitch: boolean;
  isPublished: boolean;
  schemaVersion: number;
  tourData: PublishedTourData;
  createdAt: string;
  updatedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asViewpointList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object",
  );
}

function startViewFromRecord(value: Record<string, unknown> | null): StartView | null {
  if (!value) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !Array.isArray(value.position) ||
    !Array.isArray(value.quaternion) ||
    !Array.isArray(value.target) ||
    typeof value.fov !== "number"
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    position: value.position as StartView["position"],
    quaternion: value.quaternion as StartView["quaternion"],
    target: value.target as StartView["target"],
    fov: value.fov,
  };
}

export function migratePublishedTourData(value: unknown): unknown {
  const data = asRecord(value);
  if (!data) return value;
  const player = asRecord(data.player) ?? {};
  const model = asRecord(data.model);
  const bounds = asRecord(model?.bounds);
  const min = Array.isArray(bounds?.min) ? bounds.min : [0, 0, 0];
  const max = Array.isArray(bounds?.max) ? bounds.max : [0, 1, 0];
  const minY = typeof min[1] === "number" ? min[1] : 0;
  const maxY = typeof max[1] === "number" ? max[1] : minY + 1;
  const height = Math.max(0.01, maxY - minY);
  const scene = asRecord(data.scene) ?? {};
  const ground = asRecord(scene.ground) ?? {};
  const navigation = asRecord(data.navigation) ?? {};
  const aiVisualization = asRecord(data.aiVisualization) ?? {};
  const viewpoints = asViewpointList(data.viewpoints);
  const ordered = [...viewpoints].sort((a, b) => {
    const orderA = typeof a.order === "number" ? a.order : 0;
    const orderB = typeof b.order === "number" ? b.order : 0;
    return orderA - orderB;
  });
  const explicitStart = startViewFromRecord(asRecord(data.startView));
  const startId =
    explicitStart?.id ||
    (typeof player.startViewpointId === "string" ? player.startViewpointId : "");
  const startRecord =
    ordered.find((item) => item.id === startId) ?? ordered[0] ?? null;
  const startView =
    explicitStart ??
    (startRecord
      ? {
          id: String(startRecord.id ?? "start"),
          name: String(startRecord.name ?? "Start View"),
          position: startRecord.position,
          quaternion: startRecord.quaternion,
          target: startRecord.target,
          fov: startRecord.fov,
        }
      : null);

  return {
    ...data,
    schemaVersion: PUBLISHED_TOUR_SCHEMA_VERSION,
    startView,
    navigation: {
      eyeHeight:
        typeof navigation.eyeHeight === "number" && Number.isFinite(navigation.eyeHeight)
          ? navigation.eyeHeight
          : DEFAULT_NAVIGATION.eyeHeight,
      movementSpeed:
        typeof navigation.movementSpeed === "number" &&
        Number.isFinite(navigation.movementSpeed)
          ? navigation.movementSpeed
          : DEFAULT_NAVIGATION.movementSpeed,
      maximumClickDistance:
        typeof navigation.maximumClickDistance === "number" &&
        Number.isFinite(navigation.maximumClickDistance)
          ? navigation.maximumClickDistance
          : DEFAULT_NAVIGATION.maximumClickDistance,
      collisionRadius:
        typeof navigation.collisionRadius === "number" &&
        Number.isFinite(navigation.collisionRadius)
          ? navigation.collisionRadius
          : DEFAULT_NAVIGATION.collisionRadius,
    },
    viewpoints,
    player: {
      startViewpointId:
        (startView && typeof startView.id === "string" && startView.id) ||
        startId ||
        "start",
      transitionDuration: player.transitionDuration ?? 1.1,
      autoplayEnabled: false,
      dwellTime: player.dwellTime ?? 2.5,
    },
    scene: {
      environment: DAY_ENVIRONMENT,
      ground: {
        enabled: true,
        siteGradeY:
          typeof ground.siteGradeY === "number" && Number.isFinite(ground.siteGradeY)
            ? ground.siteGradeY
            : fallbackSiteGradeY(minY, height),
        color:
          typeof ground.color === "string" && ground.color.trim()
            ? ground.color
            : DEFAULT_GROUND_COLOR,
        sizeMultiplier:
          typeof ground.sizeMultiplier === "number" &&
          Number.isFinite(ground.sizeMultiplier)
            ? ground.sizeMultiplier
            : DEFAULT_GROUND_SIZE_MULTIPLIER,
      } satisfies GroundSettings,
    },
    aiVisualization: {
      enabled:
        typeof aiVisualization.enabled === "boolean"
          ? aiVisualization.enabled
          : DEFAULT_AI_VISUALIZATION.enabled,
      maxInitialPerHour:
        typeof aiVisualization.maxInitialPerHour === "number" &&
        Number.isFinite(aiVisualization.maxInitialPerHour)
          ? aiVisualization.maxInitialPerHour
          : DEFAULT_AI_VISUALIZATION.maxInitialPerHour,
      maxFollowUps:
        typeof aiVisualization.maxFollowUps === "number" &&
        Number.isFinite(aiVisualization.maxFollowUps)
          ? aiVisualization.maxFollowUps
          : DEFAULT_AI_VISUALIZATION.maxFollowUps,
    } satisfies AiVisualizationSettings,
  };
}

export function canonicalTourJson(data: PublishedTourData) {
  return JSON.stringify(data);
}

export function snapshotHash(data: PublishedTourData) {
  return canonicalTourJson(data);
}

export function normalizePublishedTourData(
  data: PublishedTourData,
): PublishedTourData {
  const viewpoints = [...(data.viewpoints ?? [])]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((viewpoint, index) => ({ ...viewpoint, order: index }));
  return {
    ...data,
    schemaVersion: PUBLISHED_TOUR_SCHEMA_VERSION,
    viewpoints: viewpoints.length > 0 ? viewpoints : undefined,
    navigation: data.navigation,
    player: {
      startViewpointId: data.startView.id,
      transitionDuration: data.player?.transitionDuration ?? 1.1,
      autoplayEnabled: false,
      dwellTime: data.player?.dwellTime ?? 2.5,
    },
    scene: {
      environment: DAY_ENVIRONMENT,
      ground: data.scene.ground,
    },
    aiVisualization: {
      enabled: data.aiVisualization?.enabled !== false,
      maxInitialPerHour:
        data.aiVisualization?.maxInitialPerHour ??
        DEFAULT_AI_VISUALIZATION.maxInitialPerHour,
      maxFollowUps:
        data.aiVisualization?.maxFollowUps ?? DEFAULT_AI_VISUALIZATION.maxFollowUps,
    },
  };
}

export function parsePublishedTourData(value: unknown) {
  return publishedTourDataInnerSchema.parse(migratePublishedTourData(value));
}

export function safeParsePublishedTourData(value: unknown) {
  return publishedTourDataInnerSchema.safeParse(migratePublishedTourData(value));
}

export function isLocalOnlyModelUrl(url: string) {
  return url.startsWith("blob:") || url.startsWith("file:");
}
