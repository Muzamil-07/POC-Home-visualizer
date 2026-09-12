// @ts-nocheck — paused walkable-route editor
import type { WalkableRoute } from "@/types/route";
import type { TourNavigationKind } from "@/types/curated-tour";
import { CURATED_TOUR_ESTABLISH_MS } from "@/lib/house-model";
import { sleep } from "./editor-camera";
import { useTourStore } from "@/store/tour-store";

export type TourMotionApi = {
  walkRoute: (
    route: WalkableRoute,
    direction: "forward" | "reverse",
  ) => Promise<void>;
  goToViewpoint: (
    viewpointId: string,
    options?: { kind?: TourNavigationKind; fromPlayback?: boolean },
  ) => Promise<void>;
  startAutoplay: () => Promise<void>;
  restartAutoplay: () => Promise<void>;
  testRoute: (
    routeId: string,
    direction?: "forward" | "reverse",
  ) => Promise<void>;
  cancelMotion: () => void;
  pauseMotion: () => void;
  resumeMotion: () => void;
};

let tourMotion: TourMotionApi | null = null;
let establishUntil = 0;

export function registerTourMotion(api: TourMotionApi | null) {
  tourMotion = api;
}

export function getTourMotion() {
  return tourMotion;
}

export function beginEstablishing() {
  establishUntil = performance.now() + CURATED_TOUR_ESTABLISH_MS;
  useTourStore.getState().setTourMotionPhase("establishing");
}

export function establishingDeadline() {
  return establishUntil;
}

export async function waitEstablishing(signal?: AbortSignal) {
  while (performance.now() < establishUntil) {
    if (signal?.aborted) return;
    if (useTourStore.getState().isExitingTour) return;
    await sleep(40);
  }
}

export class TourMotionCancelled extends Error {
  constructor() {
    super("Tour motion cancelled");
    this.name = "TourMotionCancelled";
  }
}
