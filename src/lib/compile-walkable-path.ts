// @ts-nocheck — paused walkable-route editor
import { Vector3 } from "three";
import type { ModelSize } from "@/components/viewer/editor-camera";
import { modelBox } from "@/components/viewer/editor-camera";
import {
  nodeCameraPosition,
  reversedNodes,
} from "@/lib/walkable-route";
import {
  MIN_COMPILED_ROUTE_LENGTH,
  MAX_SEGMENT_VERTICAL_JUMP,
  DEFAULT_TURN_RADIUS,
  SAMPLE_SPACING,
  clampTurnRadius,
  type CompiledWalkablePath,
  type CornerMark,
  type UpcomingTurnInfo,
} from "@/types/tour-motion";
import type { WalkableRoute } from "@/types/route";
import type { TourViewpoint } from "@/types/tour";

const COLLAPSE_EPSILON = 0.02;
const BOUNDS_PAD_XZ = 8;
const BOUNDS_PAD_Y_MIN = 2;
const BOUNDS_PAD_Y_MAX = 4;
const MIN_ROUND_ANGLE = (12 * Math.PI) / 180;
const MAX_TRIM_FRACTION = 0.35;
const incoming = new Vector3();
const outgoing = new Vector3();
const entry = new Vector3();
const exit = new Vector3();
const bezier = new Vector3();
const tangentBefore = new Vector3();
const tangentAfter = new Vector3();

function isFiniteVec(point: Vector3) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function collapseColocated(points: Vector3[]) {
  const collapsed: Vector3[] = [];
  for (const point of points) {
    const previous = collapsed[collapsed.length - 1];
    if (!previous || previous.distanceTo(point) >= COLLAPSE_EPSILON) {
      collapsed.push(point);
    }
  }
  return collapsed;
}

function cumulativeOf(points: Vector3[]) {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    lengths.push(lengths[index - 1]! + points[index - 1]!.distanceTo(points[index]!));
  }
  return lengths;
}

function sampleQuadratic(
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  spacing: number,
) {
  const estimate = p0.distanceTo(p1) + p1.distanceTo(p2);
  const count = Math.max(4, Math.ceil(estimate / spacing));
  const out: Vector3[] = [];
  for (let index = 1; index < count; index += 1) {
    const t = index / count;
    const one = 1 - t;
    bezier.set(
      one * one * p0.x + 2 * one * t * p1.x + t * t * p2.x,
      one * one * p0.y + 2 * one * t * p1.y + t * t * p2.y,
      one * one * p0.z + 2 * one * t * p1.z + t * t * p2.z,
    );
    out.push(bezier.clone());
  }
  return out;
}

function resample(points: Vector3[], spacing: number) {
  if (points.length < 2) return points.map((point) => point.clone());
  const lengths = cumulativeOf(points);
  const total = lengths[lengths.length - 1] ?? 0;
  const samples = [points[0]!.clone()];
  if (total < spacing) {
    samples.push(points[points.length - 1]!.clone());
    return samples;
  }
  const scratch = new Vector3();
  for (let distance = spacing; distance < total - spacing * 0.35; distance += spacing) {
    sampleAt(points, lengths, total, distance, scratch);
    samples.push(scratch.clone());
  }
  samples.push(points[points.length - 1]!.clone());
  return samples;
}

function sampleAt(
  points: Vector3[],
  lengths: number[],
  total: number,
  distance: number,
  target: Vector3,
) {
  if (points.length === 0) {
    target.set(0, 0, 0);
    return target;
  }
  if (points.length === 1 || total < 1e-8) {
    target.copy(points[0]!);
    return target;
  }
  const clamped = Math.min(total, Math.max(0, distance));
  for (let index = 1; index < points.length; index += 1) {
    const endLength = lengths[index]!;
    if (clamped <= endLength) {
      const span = Math.max(1e-6, endLength - lengths[index - 1]!);
      target.lerpVectors(
        points[index - 1]!,
        points[index]!,
        (clamped - lengths[index - 1]!) / span,
      );
      return target;
    }
  }
  target.copy(points[points.length - 1]!);
  return target;
}

export function sampleCompiledPath(
  path: CompiledWalkablePath,
  distance: number,
  target: Vector3,
) {
  return sampleAt(path.samples, path.cumulativeLengths, path.totalLength, distance, target);
}

export function getPointAtDistance(
  path: CompiledWalkablePath,
  distance: number,
  target: Vector3,
) {
  return sampleCompiledPath(path, distance, target);
}

export function getTangentAtDistance(
  path: CompiledWalkablePath,
  distance: number,
  target: Vector3,
) {
  sampleCompiledPath(path, Math.max(0, distance - 0.12), tangentBefore);
  sampleCompiledPath(
    path,
    Math.min(path.totalLength, distance + 0.18),
    tangentAfter,
  );
  target.subVectors(tangentAfter, tangentBefore);
  if (target.lengthSq() < 1e-8) {
    target.set(0, 0, -1);
    return target;
  }
  return target.normalize();
}

export function getUpcomingTurn(
  path: CompiledWalkablePath,
  distance: number,
): UpcomingTurnInfo | null {
  let best: UpcomingTurnInfo | null = null;
  let bestRemaining = Infinity;
  for (const turn of path.turns) {
    const remaining = turn.pathDistance - distance;
    if (remaining < -0.08) continue;
    if (remaining > 4.5) continue;
    if (remaining < bestRemaining) {
      bestRemaining = remaining;
      best = {
        ...turn,
        distance: remaining,
      };
    }
  }
  return best;
}

function roundCorners(control: Vector3[], radius: number) {
  const marks: CornerMark[] = [];
  if (control.length < 3) return { polyline: control.map((p) => p.clone()), marks };

  const polyline: Vector3[] = [control[0]!.clone()];
  for (let index = 1; index < control.length - 1; index += 1) {
    const previous = control[index - 1]!;
    const corner = control[index]!;
    const next = control[index + 1]!;
    incoming.subVectors(corner, previous);
    outgoing.subVectors(next, corner);
    const inLen = incoming.length();
    const outLen = outgoing.length();
    if (inLen < 0.12 || outLen < 0.12) {
      polyline.push(corner.clone());
      continue;
    }
    incoming.multiplyScalar(1 / inLen);
    outgoing.multiplyScalar(1 / outLen);
    const dot = Math.min(1, Math.max(-1, incoming.dot(outgoing)));
    const turnAngle = Math.acos(dot);
    if (turnAngle < MIN_ROUND_ANGLE) {
      polyline.push(corner.clone());
      continue;
    }

    let applied = radius;
    if (turnAngle > (80 * Math.PI) / 180) applied = Math.min(applied, 0.28);
    if (turnAngle > (100 * Math.PI) / 180) applied = Math.min(applied, 0.18);
    let trimmed = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const trim = Math.min(
        applied * Math.tan(turnAngle / 2),
        MAX_TRIM_FRACTION * inLen,
        MAX_TRIM_FRACTION * outLen,
      );
      if (trim < 0.06) {
        applied *= 0.55;
        continue;
      }
      entry.copy(corner).addScaledVector(incoming, -trim);
      exit.copy(corner).addScaledVector(outgoing, trim);
      polyline.push(entry.clone());
      polyline.push(...sampleQuadratic(entry, corner, exit, SAMPLE_SPACING));
      polyline.push(exit.clone());
      marks.push({
        entry: entry.clone(),
        exit: exit.clone(),
        corner: corner.clone(),
      });
      trimmed = true;
      break;
    }
    if (!trimmed) polyline.push(corner.clone());
  }
  polyline.push(control[control.length - 1]!.clone());
  return { polyline: collapseColocated(polyline), marks };
}

function detectTurns(control: Vector3[], samples: Vector3[], lengths: number[]) {
  const turns: UpcomingTurnInfo[] = [];
  for (let index = 1; index < control.length - 1; index += 1) {
    incoming.subVectors(control[index]!, control[index - 1]!);
    outgoing.subVectors(control[index + 1]!, control[index]!);
    if (incoming.lengthSq() < 1e-6 || outgoing.lengthSq() < 1e-6) continue;
    incoming.normalize();
    outgoing.normalize();
    const dot = Math.min(1, Math.max(-1, incoming.dot(outgoing)));
    const angle = Math.acos(dot);
    if (angle < MIN_ROUND_ANGLE) continue;
    const signed = Math.atan2(
      incoming.z * outgoing.x - incoming.x * outgoing.z,
      incoming.x * outgoing.x + incoming.z * outgoing.z,
    );
    let bestDistance = 0;
    let bestGap = Infinity;
    const corner = control[index]!;
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      const gap = samples[sampleIndex]!.distanceToSquared(corner);
      if (gap < bestGap) {
        bestGap = gap;
        bestDistance = lengths[sampleIndex] ?? 0;
      }
    }
    turns.push({
      distance: bestDistance,
      pathDistance: bestDistance,
      angle,
      signedAngle: signed,
    });
  }
  return turns;
}

export function compileWalkablePath({
  route,
  sourceViewpoint,
  destinationViewpoint,
  direction,
  modelSize,
}: {
  route: WalkableRoute;
  sourceViewpoint: TourViewpoint;
  destinationViewpoint: TourViewpoint;
  direction: "forward" | "reverse";
  modelSize?: ModelSize | null;
}): CompiledWalkablePath | null {
  if (direction === "forward") {
    if (
      route.fromViewpointId !== sourceViewpoint.id ||
      route.toViewpointId !== destinationViewpoint.id
    ) {
      return null;
    }
  } else {
    if (!route.bidirectional) return null;
    if (
      route.fromViewpointId !== destinationViewpoint.id ||
      route.toViewpointId !== sourceViewpoint.id
    ) {
      return null;
    }
  }

  const nodes =
    direction === "reverse" ? reversedNodes(route.nodes) : route.nodes;

  const raw: Vector3[] = [
    new Vector3(
      sourceViewpoint.position[0],
      sourceViewpoint.position[1],
      sourceViewpoint.position[2],
    ),
    ...nodes.map((node) => {
      const camera = nodeCameraPosition(node);
      return new Vector3(camera[0], camera[1], camera[2]);
    }),
    new Vector3(
      destinationViewpoint.position[0],
      destinationViewpoint.position[1],
      destinationViewpoint.position[2],
    ),
  ];

  if (raw.some((point) => !isFiniteVec(point))) return null;
  const controlPoints = collapseColocated(raw);
  if (controlPoints.length < 2) return null;

  for (let index = 1; index < controlPoints.length; index += 1) {
    if (
      Math.abs(controlPoints[index]!.y - controlPoints[index - 1]!.y) >
      MAX_SEGMENT_VERTICAL_JUMP
    ) {
      return null;
    }
  }

  const radius = clampTurnRadius(route.turnRadius ?? DEFAULT_TURN_RADIUS);
  const rounded = roundCorners(controlPoints, radius);
  const samples = resample(rounded.polyline, SAMPLE_SPACING);
  const cumulativeLengths = cumulativeOf(samples);
  const totalLength = cumulativeLengths[cumulativeLengths.length - 1] ?? 0;
  if (totalLength < MIN_COMPILED_ROUTE_LENGTH) return null;

  if (modelSize) {
    const box = modelBox(modelSize);
    box.min.x -= BOUNDS_PAD_XZ;
    box.min.z -= BOUNDS_PAD_XZ;
    box.min.y -= BOUNDS_PAD_Y_MIN;
    box.max.x += BOUNDS_PAD_XZ;
    box.max.z += BOUNDS_PAD_XZ;
    box.max.y += BOUNDS_PAD_Y_MAX;
    if (samples.some((point) => !box.containsPoint(point))) return null;
  }

  const turns = detectTurns(controlPoints, samples, cumulativeLengths);
  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[tour] ${sourceViewpoint.name} → ${destinationViewpoint.name}: ${totalLength.toFixed(2)} m, ${samples.length} samples, ${turns.length} turns, radius ${radius.toFixed(2)} m`,
    );
  }

  return {
    samples,
    points: samples,
    cumulativeLengths,
    totalLength,
    controlPoints,
    cornerMarks: rounded.marks,
    turns,
  };
}
