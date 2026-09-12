import {
  CURATED_TOUR_MOVE_SPEED,
  CURATED_TOUR_URL,
  DEFAULT_HOUSE_MODEL_URL,
} from "@/lib/house-model";
import type {
  CuratedHouseTour,
  CuratedTourRoute,
  TourPathKeyframe,
} from "@/types/curated-tour";
import type { QuaternionTuple, TourViewpoint, Vector3Tuple } from "@/types/tour";
import { Object3D, Quaternion } from "three";

export const CURATED_STOP_PREFIX = "stop-";

export function keyframeDuration(
  from: Vector3Tuple,
  to: Vector3Tuple,
  override?: number,
) {
  if (override != null && Number.isFinite(override)) {
    return Math.min(3, Math.max(0.6, override));
  }
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  return Math.min(3, Math.max(0.6, distance / CURATED_TOUR_MOVE_SPEED));
}

export function travelLookAt(
  from: Vector3Tuple,
  to: Vector3Tuple,
): Vector3Tuple {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz) || 1;
  return [
    to[0] + (dx / length) * 2.4,
    to[1] + (dy / length) * 0.2,
    to[2] + (dz / length) * 2.4,
  ];
}

export function lookAtQuaternion(
  position: Vector3Tuple,
  target: Vector3Tuple,
): QuaternionTuple {
  const object = new Object3D();
  object.position.set(position[0], position[1], position[2]);
  object.lookAt(target[0], target[1], target[2]);
  object.updateMatrixWorld();
  return object.quaternion.toArray() as QuaternionTuple;
}

export function quaternionAgreesWithLookAt(
  quaternion: QuaternionTuple,
  position: Vector3Tuple,
  target: Vector3Tuple,
) {
  const expected = new Quaternion().fromArray(lookAtQuaternion(position, target));
  const actual = new Quaternion().fromArray(quaternion);
  return actual.angleTo(expected) < 0.12;
}

export function withAgreedOrientation(
  position: Vector3Tuple,
  target: Vector3Tuple,
  quaternion?: QuaternionTuple,
): { position: Vector3Tuple; target: Vector3Tuple; quaternion: QuaternionTuple } {
  const nextQuaternion =
    quaternion && quaternionAgreesWithLookAt(quaternion, position, target)
      ? quaternion
      : lookAtQuaternion(position, target);
  return { position, target, quaternion: nextQuaternion };
}

export function reverseRouteKeyframes(
  keyframes: TourPathKeyframe[],
  destination: Pick<TourViewpoint, "position" | "target">,
): TourPathKeyframe[] {
  const positions = [...keyframes].reverse().map((frame) => frame.position);
  return positions.map((position, index) => {
    const next = positions[index + 1] ?? destination.position;
    const isLast = index === positions.length - 1;
    return {
      position,
      lookAt: isLast ? destination.target : travelLookAt(position, next),
    };
  });
}

export function resolveRouteKeyframes(
  routes: CuratedTourRoute[],
  fromId: string | null,
  toId: string,
  destination: Pick<TourViewpoint, "position" | "target">,
) {
  if (!fromId) return null;
  const forward = routes.find(
    (route) => route.fromViewpointId === fromId && route.toViewpointId === toId,
  );
  if (forward) return forward.keyframes;
  const reverse = routes.find(
    (route) => route.fromViewpointId === toId && route.toViewpointId === fromId,
  );
  if (reverse) return reverseRouteKeyframes(reverse.keyframes, destination);
  return null;
}

export function areStopsAdjacent(
  viewpoints: TourViewpoint[],
  fromId: string | null,
  toId: string,
) {
  if (!fromId) return false;
  const fromIndex = viewpoints.findIndex((item) => item.id === fromId);
  const toIndex = viewpoints.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || toIndex < 0) return false;
  return Math.abs(fromIndex - toIndex) === 1;
}

export function viewpointsFromCuratedTour(
  tour: CuratedHouseTour,
  timestamp: string,
): TourViewpoint[] {
  return [...tour.stops]
    .sort((a, b) => a.order - b.order)
    .map((stop, index) => {
      const oriented = withAgreedOrientation(
        stop.position,
        stop.target,
        stop.quaternion,
      );
      return {
        id: stop.id,
        name: stop.name,
        description: stop.description,
        position: oriented.position,
        target: oriented.target,
        quaternion: oriented.quaternion,
        fov: stop.fov,
        order: index,
        floor: stop.floor,
        roomType: stop.roomType,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
}

export function looksLikeCuratedViewpoints(viewpoints: TourViewpoint[]) {
  return viewpoints.some((viewpoint) =>
    viewpoint.id.startsWith(CURATED_STOP_PREFIX),
  );
}

export async function fetchCuratedHouseTour(): Promise<CuratedHouseTour | null> {
  const response = await fetch(CURATED_TOUR_URL, { cache: "no-store" });
  if (!response.ok) return null;
  const tour = (await response.json()) as CuratedHouseTour;
  if (!tour?.stops?.length) return null;
  return {
    ...tour,
    modelUrl: tour.modelUrl || DEFAULT_HOUSE_MODEL_URL,
    routes: tour.routes ?? [],
  };
}

export function curatedTourToExport(
  viewpoints: TourViewpoint[],
  routes: CuratedTourRoute[],
  modelDimensions: Vector3Tuple,
  version: number,
): CuratedHouseTour {
  return {
    id: "lucas-home-full-color-tour",
    name: "Lucas Home — Curated Walkthrough",
    modelUrl: DEFAULT_HOUSE_MODEL_URL,
    modelDimensions,
    version,
    stops: viewpoints.map((viewpoint, index) => ({
      id: viewpoint.id,
      order: index,
      name: viewpoint.name,
      description: viewpoint.description,
      floor: viewpoint.floor ?? "first",
      roomType: viewpoint.roomType,
      position: viewpoint.position,
      target: viewpoint.target,
      quaternion: viewpoint.quaternion,
      fov: viewpoint.fov,
    })),
    routes,
  };
}
