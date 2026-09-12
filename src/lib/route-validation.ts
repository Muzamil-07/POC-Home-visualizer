// @ts-nocheck — paused walkable-route editor
import {
  Box3,
  BufferGeometry,
  Mesh,
  Object3D,
  Raycaster,
  Vector3,
} from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import {
  ROUTE_BODY_RADIUS,
  ROUTE_FLOOR_PROBE,
  ROUTE_HEADROOM,
  ROUTE_MAX_SLOPE,
  ROUTE_SAMPLE_STEP,
  type RouteValidationIssue,
  type WalkableRoute,
} from "@/types/route";
import type { TourViewpoint } from "@/types/tour";
import { compileWalkablePath } from "./compile-walkable-path";

type BvhGeometry = BufferGeometry & {
  boundsTree?: unknown;
  computeBoundsTree?: typeof computeBoundsTree;
  disposeBoundsTree?: typeof disposeBoundsTree;
};

let patched = false;

function ensureAcceleratedRaycast() {
  if (patched) return;
  const geometryPrototype = BufferGeometry.prototype as unknown as {
    computeBoundsTree: typeof computeBoundsTree;
    disposeBoundsTree: typeof disposeBoundsTree;
  };
  geometryPrototype.computeBoundsTree = computeBoundsTree;
  geometryPrototype.disposeBoundsTree = disposeBoundsTree;
  (Mesh.prototype as unknown as { raycast: typeof acceleratedRaycast }).raycast =
    acceleratedRaycast;
  patched = true;
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function asBvhGeometry(geometry: BufferGeometry) {
  return geometry as BvhGeometry;
}

export function ensureRouteBoundsTrees(root: Object3D) {
  ensureAcceleratedRaycast();
  const seen = new Set<BufferGeometry>();
  root.traverse((object) => {
    if (!isMesh(object) || !object.geometry) return;
    if (seen.has(object.geometry)) return;
    seen.add(object.geometry);
    const geometry = asBvhGeometry(object.geometry);
    if (!geometry.boundsTree) {
      geometry.computeBoundsTree?.();
    }
  });
}

const down = new Vector3(0, -1, 0);
const up = new Vector3(0, 1, 0);
const raycaster = new Raycaster();

function firstHit(root: Object3D, origin: Vector3, direction: Vector3, far: number) {
  raycaster.firstHitOnly = true;
  raycaster.far = far;
  raycaster.set(origin, direction);
  const hits = raycaster.intersectObject(root, true);
  return hits[0] ?? null;
}

export function validateWalkableRoute(
  root: Object3D | null,
  route: WalkableRoute,
  from: TourViewpoint,
  to: TourViewpoint,
): Pick<WalkableRoute, "valid" | "validationIssues"> {
  if (!root) {
    return {
      valid: false,
      validationIssues: [
        {
          position: from.position,
          type: "outside-model",
          message: "Load a model before validating this route.",
        },
      ],
    };
  }

  root.updateWorldMatrix(true, true);
  ensureRouteBoundsTrees(root);
  const bounds = new Box3().setFromObject(root);
  const expanded = bounds.clone().expandByScalar(1.5);
  const compiled = compileWalkablePath({
    route,
    sourceViewpoint: from,
    destinationViewpoint: to,
    direction: "forward",
  });
  const issues: RouteValidationIssue[] = [];
  if (!compiled) {
    return {
      valid: false,
      validationIssues: [
        {
          position: from.position,
          type: "outside-model",
          message: "Could not compile a walkable path from these points.",
        },
      ],
    };
  }

  const samples = compiled.samples
    .filter((_, index) => index % 2 === 0 || index === compiled.samples.length - 1)
    .map((point, index) => ({
      segmentIndex: index,
      point: [point.x, point.y, point.z] as [number, number, number],
    }));
  const side = new Vector3();
  const ahead = new Vector3();
  const origin = new Vector3();

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    const next = samples[Math.min(samples.length - 1, index + 1)]!;
    origin.set(sample.point[0], sample.point[1], sample.point[2]);
    if (!expanded.containsPoint(origin)) {
      issues.push({
        segmentIndex: sample.segmentIndex,
        position: sample.point,
        type: "outside-model",
        message: `Path leaves the model near segment ${sample.segmentIndex + 1}`,
      });
      break;
    }

    ahead.set(
      next.point[0] - sample.point[0],
      next.point[1] - sample.point[1],
      next.point[2] - sample.point[2],
    );
    const run = Math.hypot(ahead.x, ahead.z);
    if (run > 0.02 && Math.abs(ahead.y) / run > ROUTE_MAX_SLOPE) {
      issues.push({
        segmentIndex: sample.segmentIndex,
        position: sample.point,
        type: "excessive-slope",
        message: `Path is too steep between points ${sample.segmentIndex + 1} and ${sample.segmentIndex + 2}`,
      });
    }

    const floorHit = firstHit(
      root,
      origin.clone().addScaledVector(up, 0.08),
      down,
      ROUTE_FLOOR_PROBE,
    );
    if (!floorHit) {
      issues.push({
        segmentIndex: sample.segmentIndex,
        position: sample.point,
        type: "missing-floor",
        message: `No floor under the path between points ${sample.segmentIndex + 1} and ${sample.segmentIndex + 2}`,
      });
    }

    const headHit = firstHit(root, origin, up, ROUTE_HEADROOM);
    if (headHit && headHit.distance < ROUTE_HEADROOM * 0.55) {
      issues.push({
        segmentIndex: sample.segmentIndex,
        position: sample.point,
        type: "insufficient-headroom",
        message: `Not enough headroom between points ${sample.segmentIndex + 1} and ${sample.segmentIndex + 2}`,
      });
    }

    if (ahead.lengthSq() > 1e-6) {
      ahead.normalize();
      side.set(-ahead.z, 0, ahead.x);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const probes = [
        origin.clone(),
        origin.clone().addScaledVector(side, ROUTE_BODY_RADIUS),
        origin.clone().addScaledVector(side, -ROUTE_BODY_RADIUS),
        origin.clone().add(up.clone().multiplyScalar(0.35)),
      ];
      for (const probe of probes) {
        const hit = firstHit(root, probe, ahead, Math.max(0.35, ROUTE_SAMPLE_STEP + 0.12));
        if (hit && hit.distance < ROUTE_BODY_RADIUS + 0.06) {
          issues.push({
            segmentIndex: sample.segmentIndex,
            position: sample.point,
            type: "wall-intersection",
            message: `Path intersects geometry between points ${sample.segmentIndex + 1} and ${sample.segmentIndex + 2}`,
          });
          break;
        }
      }
    }

    if (issues.length > 24) break;
  }

  if (compiled.totalLength < 0.05) {
    issues.push({
      position: from.position,
      type: "outside-model",
      message: "Route start and end are too close.",
    });
  }

  const unique = issues.filter(
    (issue, index) =>
      issues.findIndex(
        (item) =>
          item.type === issue.type && item.segmentIndex === issue.segmentIndex,
      ) === index,
  );

  return {
    valid: unique.length === 0,
    validationIssues: unique,
  };
}
