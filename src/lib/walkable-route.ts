// @ts-nocheck — paused walkable-route editor
import type { CuratedTourRoute } from "@/types/curated-tour";
import {
  DEFAULT_WALKING_SPEED,
  DEFAULT_YAW_SPEED_DEG,
  ROUTE_EYE_HEIGHT,
  clampLookAhead,
  clampWalkingSpeed,
  clampYawSpeedDeg,
  type WalkableRoute,
  type WalkableRouteNode,
} from "@/types/route";
import { clampTurnRadius, DEFAULT_TURN_RADIUS } from "@/types/tour-motion";
import type { TourViewpoint, Vector3Tuple } from "@/types/tour";
import { Vector3 } from "three";

export function createRouteId() {
  return `route-${crypto.randomUUID()}`;
}

export function createRouteNode(
  floorPosition: Vector3Tuple,
  eyeHeight?: number,
): WalkableRouteNode {
  return {
    id: `node-${crypto.randomUUID()}`,
    floorPosition: [...floorPosition] as Vector3Tuple,
    eyeHeight,
  };
}

export function createWalkableRoute(
  fromViewpointId: string,
  toViewpointId: string,
): WalkableRoute {
  return {
    id: createRouteId(),
    fromViewpointId,
    toViewpointId,
    nodes: [],
    bidirectional: true,
    walkingSpeed: DEFAULT_WALKING_SPEED,
    turnRadius: DEFAULT_TURN_RADIUS,
    lookAheadDistance: 0,
    maxYawSpeedDeg: DEFAULT_YAW_SPEED_DEG,
    valid: false,
    validationIssues: [],
  };
}

export function nodeCameraPosition(
  node: WalkableRouteNode,
  fallbackEye = ROUTE_EYE_HEIGHT,
): Vector3Tuple {
  const eye = node.eyeHeight ?? fallbackEye;
  return [
    node.floorPosition[0],
    node.floorPosition[1] + eye,
    node.floorPosition[2],
  ];
}

export function viewpointFloorPosition(
  viewpoint: Pick<TourViewpoint, "position">,
  eye = ROUTE_EYE_HEIGHT,
): Vector3Tuple {
  return [viewpoint.position[0], viewpoint.position[1] - eye, viewpoint.position[2]];
}

export function routeCameraPolyline(
  route: WalkableRoute,
  from: Pick<TourViewpoint, "position">,
  to: Pick<TourViewpoint, "position">,
): Vector3Tuple[] {
  return [
    from.position,
    ...route.nodes.map((node) => nodeCameraPosition(node)),
    to.position,
  ];
}

export function routeFloorPolyline(
  route: WalkableRoute,
  from: Pick<TourViewpoint, "position">,
  to: Pick<TourViewpoint, "position">,
): Vector3Tuple[] {
  return [
    viewpointFloorPosition(from),
    ...route.nodes.map((node) => node.floorPosition),
    viewpointFloorPosition(to),
  ];
}

export function polylineLength(points: Vector3Tuple[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) continue;
    total += Math.hypot(
      current[0] - previous[0],
      current[1] - previous[1],
      current[2] - previous[2],
    );
  }
  return total;
}

export function estimateWalkDuration(length: number, speed: number) {
  const walking = clampWalkingSpeed(speed);
  return length / walking + 0.5 + 0.7;
}

function cumulative(points: Vector3Tuple[]) {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    distances.push(
      distances[index - 1]! +
        Math.hypot(
          current[0] - previous[0],
          current[1] - previous[1],
          current[2] - previous[2],
        ),
    );
  }
  return distances;
}

export function pointAtDistance(points: Vector3Tuple[], distance: number): Vector3Tuple {
  if (points.length === 0) return [0, 0, 0];
  if (points.length === 1) return points[0]!;
  const lengths = cumulative(points);
  const total = lengths[lengths.length - 1] ?? 0;
  const clamped = Math.min(total, Math.max(0, distance));
  for (let index = 1; index < points.length; index += 1) {
    if (clamped <= lengths[index]!) {
      const start = points[index - 1]!;
      const end = points[index]!;
      const span = Math.max(1e-6, lengths[index]! - lengths[index - 1]!);
      const t = (clamped - lengths[index - 1]!) / span;
      return [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
        start[2] + (end[2] - start[2]) * t,
      ];
    }
  }
  return points[points.length - 1]!;
}

export function lookAheadPoint(
  points: Vector3Tuple[],
  distance: number,
  lookahead: number,
): Vector3Tuple {
  return pointAtDistance(points, distance + lookahead);
}

function closestPointOnSegment(
  start: Vector3Tuple,
  end: Vector3Tuple,
  point: Vector3Tuple,
) {
  const ab = new Vector3(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  const ap = new Vector3(point[0] - start[0], point[1] - start[1], point[2] - start[2]);
  const lengthSq = ab.lengthSq();
  const t = lengthSq < 1e-8 ? 0 : Math.min(1, Math.max(0, ap.dot(ab) / lengthSq));
  return {
    t,
    point: [
      start[0] + ab.x * t,
      start[1] + ab.y * t,
      start[2] + ab.z * t,
    ] as Vector3Tuple,
    distance: Math.hypot(
      point[0] - (start[0] + ab.x * t),
      point[1] - (start[1] + ab.y * t),
      point[2] - (start[2] + ab.z * t),
    ),
  };
}

export function insertNodeOnNearestSegment(
  route: WalkableRoute,
  from: Pick<TourViewpoint, "position">,
  to: Pick<TourViewpoint, "position">,
  floorPosition: Vector3Tuple,
): WalkableRoute {
  const anchors = routeFloorPolyline(route, from, to);
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index]!;
    const end = anchors[index + 1]!;
    const nearest = closestPointOnSegment(start, end, floorPosition);
    if (nearest.distance < bestDistance) {
      bestDistance = nearest.distance;
      bestIndex = index;
    }
  }
  const nodes = [...route.nodes];
  nodes.splice(bestIndex, 0, createRouteNode(floorPosition));
  return { ...route, nodes };
}

export function findRoute(
  routes: WalkableRoute[],
  fromId: string | null,
  toId: string,
) {
  if (!fromId) return null;
  const forward = routes.find(
    (route) => route.fromViewpointId === fromId && route.toViewpointId === toId,
  );
  if (forward) return { route: forward, reversed: false };
  const reverse = routes.find(
    (route) =>
      route.bidirectional &&
      route.fromViewpointId === toId &&
      route.toViewpointId === fromId,
  );
  if (reverse) return { route: reverse, reversed: true };
  return null;
}

export function reversedNodes(nodes: WalkableRouteNode[]) {
  return [...nodes].reverse();
}

export function walkableFromCurated(route: CuratedTourRoute): WalkableRoute {
  const nodes =
    route.nodes?.map((node) => ({
      id: node.id || `node-${crypto.randomUUID()}`,
      floorPosition: node.floorPosition,
      eyeHeight: node.eyeHeight,
    })) ??
    (route.keyframes ?? []).map((keyframe) =>
      createRouteNode([
        keyframe.position[0],
        keyframe.position[1] - ROUTE_EYE_HEIGHT,
        keyframe.position[2],
      ]),
    );
  return {
    id: `route-${route.fromViewpointId}-${route.toViewpointId}`,
    fromViewpointId: route.fromViewpointId,
    toViewpointId: route.toViewpointId,
    nodes,
    bidirectional: route.bidirectional ?? true,
    walkingSpeed: clampWalkingSpeed(route.walkingSpeed ?? DEFAULT_WALKING_SPEED),
    turnRadius: clampTurnRadius(route.turnRadius),
    lookAheadDistance: clampLookAhead(route.lookAheadDistance),
    maxYawSpeedDeg: clampYawSpeedDeg(route.maxYawSpeedDeg),
    valid: false,
    validationIssues: [],
  };
}

export function walkableToCurated(route: WalkableRoute): CuratedTourRoute {
  return {
    fromViewpointId: route.fromViewpointId,
    toViewpointId: route.toViewpointId,
    nodes: route.nodes,
    bidirectional: route.bidirectional,
    walkingSpeed: route.walkingSpeed,
    turnRadius: route.turnRadius,
    lookAheadDistance: route.lookAheadDistance,
    maxYawSpeedDeg: route.maxYawSpeedDeg,
    keyframes: route.nodes.map((node) => ({
      position: nodeCameraPosition(node),
    })),
  };
}
