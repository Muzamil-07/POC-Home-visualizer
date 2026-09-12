import type { QuaternionTuple, Vector3Tuple } from "@/types/tour";

export type ExplorationPhase =
  | "loading"
  | "intro"
  | "idle"
  | "looking"
  | "validating"
  | "rotating"
  | "moving"
  | "arriving"
  | "blocked"
  | "exiting";

export type StartView = {
  id: string;
  name: string;
  position: Vector3Tuple;
  quaternion: QuaternionTuple;
  target: Vector3Tuple;
  fov: number;
};

export type NavigationSettings = {
  eyeHeight: number;
  movementSpeed: number;
  maximumClickDistance: number;
  collisionRadius: number;
};

export type FloorPickKind = "valid" | "invalid" | "far" | "blocked" | "tight" | "stairs";

export type FloorPick = {
  kind: FloorPickKind;
  point: Vector3Tuple;
  normal: Vector3Tuple;
  destination: Vector3Tuple;
  distance: number;
  message: string | null;
};
