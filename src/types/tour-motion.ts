import type { Vector3 } from "three";

export type TourMotionPhase =
  | "idle"
  | "establishing"
  | "aligning"
  | "accelerating"
  | "walking"
  | "slowing-for-turn"
  | "turning-in-place"
  | "arriving"
  | "dwelling"
  | "paused"
  | "error";

export interface UpcomingTurnInfo {
  distance: number;
  pathDistance: number;
  angle: number;
  signedAngle: number;
}

export interface CornerMark {
  entry: Vector3;
  exit: Vector3;
  corner: Vector3;
}

export interface CompiledWalkablePath {
  samples: Vector3[];
  points: Vector3[];
  cumulativeLengths: number[];
  totalLength: number;
  controlPoints: Vector3[];
  cornerMarks: CornerMark[];
  turns: UpcomingTurnInfo[];
}

export interface TourCoverageGap {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
}

export interface TourMotionDebug {
  phase: TourMotionPhase;
  fromName: string;
  toName: string;
  routeId: string;
  length: number;
  speed: number;
  distance: number;
  expectedDuration: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  lookAhead: number;
  turnAngleDeg: number;
  distanceToTurn: number;
  yawRateDeg: number;
}

export const TOUR_MOTION_DEBUG =
  process.env.NEXT_PUBLIC_TOUR_DEBUG === "1" ||
  process.env.NODE_ENV !== "production";

export const PLAYBACK_WALK_MIN = 0.7;
export const PLAYBACK_WALK_MAX = 1.4;
export const DEFAULT_PLAYBACK_SPEED = 1.0;
export const MIN_TURN_SPEED = 0.3;
export const WALK_ARRIVE_METERS = 1.0;
export const MIN_COMPILED_ROUTE_LENGTH = 0.1;
export const MAX_SEGMENT_VERTICAL_JUMP = 3.25;
export const MAX_WALK_PITCH = 0.55;
export const DEFAULT_TURN_RADIUS = 0.35;
export const MIN_TURN_RADIUS = 0.1;
export const MAX_TURN_RADIUS = 1.0;
export const NORMAL_YAW_SPEED = (55 * Math.PI) / 180;
export const MAXIMUM_YAW_SPEED = (85 * Math.PI) / 180;
export const MAXIMUM_PITCH_SPEED = (25 * Math.PI) / 180;
export const TIGHT_TURN_RADIANS = (100 * Math.PI) / 180;
export const SAMPLE_SPACING = 0.1;
export const SPEED_DAMPING = 3.4;
export const ALIGN_YAW_RADIANS = (8 * Math.PI) / 180;
export const ALIGN_MIN_SECONDS = 0.35;
export const ALIGN_MAX_SECONDS = 1.6;

export function isTourMotionBusy(phase: TourMotionPhase) {
  return (
    phase === "aligning" ||
    phase === "accelerating" ||
    phase === "walking" ||
    phase === "slowing-for-turn" ||
    phase === "turning-in-place" ||
    phase === "arriving"
  );
}

export function clampPlaybackSpeed(value: number | undefined) {
  const speed = Number.isFinite(value) ? (value as number) : DEFAULT_PLAYBACK_SPEED;
  return Math.min(PLAYBACK_WALK_MAX, Math.max(PLAYBACK_WALK_MIN, speed));
}

export function clampTurnRadius(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_TURN_RADIUS;
  return Math.min(MAX_TURN_RADIUS, Math.max(MIN_TURN_RADIUS, value as number));
}
