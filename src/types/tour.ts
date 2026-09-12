export type Vector3Tuple = [number, number, number];
export type QuaternionTuple = [number, number, number, number];

export type TransformMode = "translate" | "rotate";
export type AppMode = "edit" | "tour" | "explore";
export type TourFloor = "exterior" | "first" | "stairs" | "second";

export type ViewpointConfidence = "high" | "medium" | "low";

export interface TourViewpoint {
  id: string;
  name: string;
  description: string;
  position: Vector3Tuple;
  quaternion: QuaternionTuple;
  target: Vector3Tuple;
  fov: number;
  order: number;
  createdAt: string;
  updatedAt: string;
  floor?: TourFloor;
  roomType?: string;
  generatedBy?: "template";
  suggestedType?: string;
  confidence?: ViewpointConfidence;
}

export type ModelIdentityInput = {
  filename: string;
  fileSize: number | null;
  lastModified: number | null;
};

export type EditorCameraSnapshot = {
  position: Vector3Tuple;
  quaternion: QuaternionTuple;
  target: Vector3Tuple;
  fov: number;
};

export interface SectionState {
  enabled: boolean;
  height: number;
  showPlane: boolean;
}

export interface SectionBounds {
  minY: number;
  maxY: number;
  modelHeight: number;
}

export const idleSectionState = (): SectionState => ({
  enabled: false,
  height: 0,
  showPlane: true,
});

export interface ViewpointPlacementDraft {
  surfacePoint: Vector3Tuple;
  position: Vector3Tuple;
  target: Vector3Tuple;
  quaternion: QuaternionTuple;
  fov: number;
}

export const MIN_FOV = 20;
export const MAX_FOV = 100;
export const DEFAULT_FOV = 46;
export const PREVIEW_DURATION_SECONDS = 1.1;
export const TOUR_PITCH_LIMIT = (85 * Math.PI) / 180;
export const DEFAULT_EYE_HEIGHT = 1.65;
export const MIN_EYE_HEIGHT = 1.2;
export const MAX_EYE_HEIGHT = 2.2;
export const EYE_HEIGHT_STEP = 0.05;
export const WALKABLE_NORMAL_Y = 0.75;
export const MIN_TARGET_DISTANCE = 0.5;

export function createModelIdentity(input: ModelIdentityInput) {
  return [
    input.filename.trim().toLowerCase(),
    input.fileSize ?? "na",
    input.lastModified ?? "na",
  ].join("::");
}

export function clampFov(fov: number) {
  return Math.min(MAX_FOV, Math.max(MIN_FOV, fov));
}

export function clampEyeHeight(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_EYE_HEIGHT;
  return Math.min(MAX_EYE_HEIGHT, Math.max(MIN_EYE_HEIGHT, value));
}

export function nextViewpointName(viewpoints: TourViewpoint[]) {
  const used = viewpoints.map((viewpoint) => {
    const match = /^Viewpoint (\d+)$/.exec(viewpoint.name);
    return match ? Number(match[1]) : 0;
  });
  return `Viewpoint ${Math.max(0, ...used) + 1}`;
}

export function sortViewpoints(viewpoints: TourViewpoint[]) {
  return [...viewpoints].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}
