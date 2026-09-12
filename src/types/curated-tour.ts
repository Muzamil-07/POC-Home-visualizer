import type { QuaternionTuple, Vector3Tuple } from "./tour";

export type CuratedTourFloor = "exterior" | "first" | "stairs" | "second";

export interface TourPathKeyframe {
  position: Vector3Tuple;
  lookAt?: Vector3Tuple;
  duration?: number;
}

export interface CuratedTourStop {
  id: string;
  order: number;
  name: string;
  description: string;
  floor: CuratedTourFloor;
  roomType?: string;
  position: Vector3Tuple;
  target: Vector3Tuple;
  quaternion: QuaternionTuple;
  fov: number;
}

export interface CuratedTourRoute {
  fromViewpointId: string;
  toViewpointId: string;
  keyframes: TourPathKeyframe[];
}

export interface CuratedHouseTour {
  id: string;
  name: string;
  modelUrl: string;
  modelDimensions: Vector3Tuple;
  version: number;
  stops: CuratedTourStop[];
  routes: CuratedTourRoute[];
}

export type TourNavigationKind = "enter" | "adjacent" | "jump" | "autoplay";

export type TourPlaybackState = "idle" | "playing" | "paused";
