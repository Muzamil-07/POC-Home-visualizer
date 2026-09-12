import {
  Euler,
  MathUtils,
  Matrix3,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
  type Object3D,
  type PerspectiveCamera,
} from "three";
import type { ModelSize } from "@/components/viewer/editor-camera";
import { modelBox, modelDiagonal } from "@/components/viewer/editor-camera";
import type {
  FloorPickKind,
  NavigationSettings,
  StartView,
} from "@/types/exploration";
import type { QuaternionTuple, Vector3Tuple } from "@/types/tour";

export const DEFAULT_NAVIGATION: NavigationSettings = {
  eyeHeight: 1.65,
  movementSpeed: 2,
  maximumClickDistance: 15,
  collisionRadius: 0.25,
};

export const EXPLORATION_WALKABLE_Y = 0.7;
export const INTRO_DURATION = 2;
export const ROTATE_DURATION = 0.45;

const raycaster = new Raycaster();
const pointerNdc = new Vector2();
const _origin = new Vector3();
const _dir = new Vector3();
const _rayDir = new Vector3();
const _offset = new Vector3();
const _normalMatrix = new Matrix3();
const _from = new Vector3();
const _to = new Vector3();
const _delta = new Vector3();

const WORLD_UP = new Vector3(0, 1, 0);

/**
 * A surface counts as a walkable floor when the absolute dot of its world
 * normal with world-up clears this threshold. Using the absolute value keeps
 * reversed/back-wound GLB floor triangles (common in SketchUp exports) from
 * being rejected. Ceilings are removed separately via the oriented-normal and
 * semantic-name checks.
 */
export const FLOOR_HORIZONTAL_SCORE = 0.65;

/** Semantic rejection for horizontal surfaces we should never stand on. */
const NON_WALKABLE_NAME =
  /(roof|ceiling|soffit|fascia|gutter|counter|countertop|worktop|table|desk|furniture|cabinet|cupboard|vanity|sofa|couch|bed(?!room)|mattress|lamp|sconce|chandelier|sink|basin|bathtub|tub|toilet|fridge|refrigerator|oven|stove|cooktop|range|microwave|dishwasher|shelf|mantel|fireplace|hearth)/i;

const BLOCKED_MESSAGE =
  "That point is blocked. Choose a closer visible floor position.";

/**
 * Pull the standing position back from the clicked floor point so arrival feels
 * like stopping a step or two early rather than overshooting onto the marker.
 */
export const ARRIVAL_STOP_SHORT = 0.65;
/** Never shorten a move by more than this fraction of planar travel. */
const ARRIVAL_STOP_SHORT_MAX_FRACTION = 0.4;
/** Below this planar distance, skip stop-short (tiny nudges). */
const ARRIVAL_STOP_SHORT_MIN_TRAVEL = 0.35;

const HORIZONTAL_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315].map(
  (deg) => (deg * Math.PI) / 180,
);

export function clampNavigation(
  value: Partial<NavigationSettings> | null | undefined,
): NavigationSettings {
  return {
    eyeHeight: MathUtils.clamp(value?.eyeHeight ?? DEFAULT_NAVIGATION.eyeHeight, 1.2, 2.2),
    movementSpeed: MathUtils.clamp(
      value?.movementSpeed ?? DEFAULT_NAVIGATION.movementSpeed,
      0.6,
      4,
    ),
    maximumClickDistance: MathUtils.clamp(
      value?.maximumClickDistance ?? DEFAULT_NAVIGATION.maximumClickDistance,
      4,
      40,
    ),
    collisionRadius: MathUtils.clamp(
      value?.collisionRadius ?? DEFAULT_NAVIGATION.collisionRadius,
      0.15,
      0.45,
    ),
  };
}

export function startViewFromViewpoint(viewpoint: {
  id: string;
  name: string;
  position: Vector3Tuple;
  quaternion: QuaternionTuple;
  target: Vector3Tuple;
  fov: number;
}): StartView {
  return {
    id: viewpoint.id,
    name: viewpoint.name.trim() || "Start View",
    position: viewpoint.position,
    quaternion: viewpoint.quaternion,
    target: viewpoint.target,
    fov: viewpoint.fov,
  };
}

export function computeIntroPose(startView: StartView, modelSize: ModelSize | null) {
  const startPosition = new Vector3(...startView.position);
  const startTarget = new Vector3(...startView.target);
  const forward = startTarget.clone().sub(startPosition);
  if (forward.lengthSq() < 1e-6) {
    forward.set(0, 0, -1).applyQuaternion(new Quaternion().fromArray(startView.quaternion));
  }
  forward.normalize();

  const diagonal = modelDiagonal(modelSize);
  const introDistance = MathUtils.clamp(diagonal * 0.12, 6, 15);
  const introHeight = MathUtils.clamp(diagonal * 0.04, 2, 6);
  const introPosition = startPosition
    .clone()
    .addScaledVector(forward, -introDistance)
    .add(new Vector3(0, introHeight, 0));

  return {
    introPosition,
    introTarget: startTarget.clone(),
    startPosition,
    startTarget,
    forward,
  };
}

export function movementDuration(distance: number, speed: number) {
  return MathUtils.clamp(distance / Math.max(speed, 0.4), 0.65, 6);
}

export function smootherstep(t: number) {
  const x = MathUtils.clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function isWalkableExplorationNormal(normal: Vector3) {
  return normal.y >= EXPLORATION_WALKABLE_Y;
}

function chainVisible(object: Object3D, root: Object3D) {
  let node: Object3D | null = object;
  while (node) {
    if (node.visible === false) return false;
    if (node === root) break;
    node = node.parent;
  }
  return true;
}

function materialRenders(material: unknown) {
  if (!material) return false;
  const list = Array.isArray(material) ? material : [material];
  return list.some((entry) => {
    const mat = entry as {
      visible?: boolean;
      transparent?: boolean;
      opacity?: number;
    };
    if (!mat) return false;
    if (mat.visible === false) return false;
    if (mat.transparent && typeof mat.opacity === "number" && mat.opacity < 0.05) {
      return false;
    }
    return true;
  });
}

/**
 * Return the nearest genuinely rendered mesh surface under the pointer that
 * belongs to the model root. Intersections are walked in depth order so we stop
 * at the first visible, non-transparent triangle and never "see through" solid
 * walls to a floor behind them. The caller is responsible for passing the model
 * root only (never the environment ground, sky, helpers, markers, or gizmos).
 */
export function pickModelSurface(
  camera: PerspectiveCamera,
  root: Object3D,
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  far: number,
): Intersection | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  pointerNdc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.firstHitOnly = false;
  raycaster.near = 0;
  raycaster.far = far;
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObject(root, true);
  for (const hit of hits) {
    const object = hit.object as Object3D & {
      isMesh?: boolean;
      material?: unknown;
    };
    if (!object.isMesh || !hit.face) continue;
    if (!chainVisible(object, root)) continue;
    if (!materialRenders(object.material)) continue;
    return hit;
  }
  return null;
}

export type FloorDetection = {
  isFloor: boolean;
  /** World-space normal oriented toward the viewer (points up for floors). */
  normal: Vector3;
  /** Absolute dot of the world normal with world-up (0..1). */
  horizontalScore: number;
  objectName: string;
  /** Reason the surface was rejected as a floor, or null when it is a floor. */
  rejection: string | null;
};

/**
 * Decide whether an intersection is a walkable model floor, independent of any
 * reachability/collision reasoning. Uses a normal-matrix world normal plus the
 * absolute horizontal score so reversed floor triangles still pass, then rules
 * out ceilings (oriented normal must point up) and named non-walkable surfaces.
 */
export function detectFloor(
  hit: Intersection,
  rayDirection?: Vector3,
): FloorDetection {
  _normalMatrix.getNormalMatrix(hit.object.matrixWorld);
  const worldNormal = hit.face!.normal.clone().applyNormalMatrix(_normalMatrix);
  const horizontalScore = Math.abs(worldNormal.dot(WORLD_UP));

  // Orient toward the camera so a floor's normal points up regardless of how
  // the triangle was wound. This is what separates floors (up) from ceilings
  // (down) once the absolute horizontal test has passed.
  const oriented = worldNormal.clone();
  if (rayDirection && oriented.dot(rayDirection) > 0) oriented.negate();

  const objectName = hit.object.name ?? "";
  let rejection: string | null = null;
  if (horizontalScore < FLOOR_HORIZONTAL_SCORE) {
    rejection = "not-horizontal";
  } else if (oriented.y < FLOOR_HORIZONTAL_SCORE) {
    rejection = "faces-down";
  } else if (NON_WALKABLE_NAME.test(objectName)) {
    rejection = `named:${objectName}`;
  }

  return {
    isFloor: rejection === null,
    normal: oriented,
    horizontalScore,
    objectName,
    rejection,
  };
}

function firstHit(
  root: Object3D,
  origin: Vector3,
  direction: Vector3,
  far: number,
) {
  raycaster.firstHitOnly = true;
  raycaster.far = far;
  raycaster.set(origin, direction);
  const hits = raycaster.intersectObject(root, true);
  return hits[0] ?? null;
}

export function destinationInsideModel(
  destination: Vector3,
  modelSize: ModelSize | null,
) {
  if (!modelSize) return true;
  const box = modelBox(modelSize);
  box.expandByScalar(4);
  return box.containsPoint(destination);
}

export function validateStandingPose(
  root: Object3D,
  destination: Vector3,
  navigation: NavigationSettings,
  modelSize: ModelSize | null,
): FloorPickKind | "ok" {
  if (
    !Number.isFinite(destination.x) ||
    !Number.isFinite(destination.y) ||
    !Number.isFinite(destination.z)
  ) {
    return "tight";
  }
  if (!destinationInsideModel(destination, modelSize)) return "tight";

  _dir.set(0, 1, 0);
  const headroom = firstHit(root, destination, _dir, 0.55);
  if (headroom && headroom.distance < 0.32) return "tight";

  const radius = navigation.collisionRadius;
  for (const angle of HORIZONTAL_ANGLES) {
    _dir.set(Math.cos(angle), 0, Math.sin(angle));
    const hit = firstHit(root, destination, _dir, radius + 0.08);
    if (hit && hit.distance < radius) return "tight";
    _origin.copy(destination);
    _origin.y -= Math.min(0.75, navigation.eyeHeight * 0.45);
    const low = firstHit(root, _origin, _dir, radius + 0.08);
    if (low && low.distance < radius) return "tight";
  }
  return "ok";
}

export function validateTravelSegment(
  root: Object3D,
  from: Vector3,
  to: Vector3,
  navigation: NavigationSettings,
) {
  _delta.copy(to).sub(from);
  const distance = _delta.length();
  if (distance < 0.05) return true;
  _dir.copy(_delta).normalize();
  const radius = navigation.collisionRadius;
  const far = Math.max(0.05, distance - 0.08);

  const offsets: Vector3[] = [
    new Vector3(0, 0, 0),
    new Vector3(0, 0.35, 0),
    new Vector3(0, -Math.min(0.7, navigation.eyeHeight * 0.4), 0),
    new Vector3(-radius, 0, 0),
    new Vector3(radius, 0, 0),
  ];

  const right = new Vector3().crossVectors(_dir, new Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();

  for (const offset of offsets) {
    if (offset.x !== 0) {
      _origin.copy(from).addScaledVector(right, offset.x);
    } else {
      _origin.copy(from);
    }
    _origin.y += offset.y;
    const hit = firstHit(root, _origin, _dir, far);
    if (hit && hit.distance < far) return false;
  }
  return true;
}

export function introPathClear(
  root: Object3D,
  from: Vector3,
  to: Vector3,
  navigation: NavigationSettings,
) {
  return validateTravelSegment(root, from, to, navigation);
}

const lookEuler = new Euler(0, 0, 0, "YXZ");

export function lookRotation(from: Vector3, to: Vector3) {
  const quaternion = new Quaternion();
  _dir.copy(to).sub(from);
  if (_dir.lengthSq() < 1e-8) return quaternion.identity();
  const yaw = Math.atan2(-_dir.x, -_dir.z);
  const planar = Math.hypot(_dir.x, _dir.z);
  const pitch = Math.atan2(_dir.y, Math.max(planar, 1e-5));
  lookEuler.set(MathUtils.clamp(pitch, -1.35, 1.35), yaw, 0, "YXZ");
  return quaternion.setFromEuler(lookEuler).clone();
}

export type FloorReach = "reachable" | "far" | "stairs" | "tight" | "blocked";

type ReachResult = {
  reach: FloorReach;
  destination: Vector3;
  distance: number;
  message: string | null;
};

/**
 * Reachability for an already-detected floor point.
 *
 * This is intentionally *permissive*: point-and-go is a "click any visible floor
 * to go there" interaction, so nearby geometry must not block it. Collision,
 * standing clearance, travel line-of-sight, click distance, and stair grading
 * are NOT hard requirements. A spot that sits beside or partly under furniture,
 * across the room, through a doorway, or on a different level can all be
 * selected. Only a genuinely invalid (non-finite) destination is rejected.
 *
 * The stricter helpers (`validateStandingPose`, `validateTravelSegment`) are
 * kept for other uses (e.g. the intro fly-in) but no longer gate movement.
 */
export function assessReach(
  floorPoint: Vector3,
  camera: PerspectiveCamera,
  navigation: NavigationSettings,
): ReachResult {
  const destination = new Vector3(
    floorPoint.x,
    floorPoint.y + navigation.eyeHeight,
    floorPoint.z,
  );
  const planarDx = floorPoint.x - camera.position.x;
  const planarDz = floorPoint.z - camera.position.z;
  const planar = Math.hypot(planarDx, planarDz);

  // Stop a little short of the click so the camera doesn't finish standing on
  // (or past) the marker — about one to two walking steps early.
  if (planar > ARRIVAL_STOP_SHORT_MIN_TRAVEL) {
    const pullBack = Math.min(
      ARRIVAL_STOP_SHORT,
      planar * ARRIVAL_STOP_SHORT_MAX_FRACTION,
    );
    const remain = Math.max(planar - pullBack, 0);
    const scale = remain / planar;
    destination.x = camera.position.x + planarDx * scale;
    destination.z = camera.position.z + planarDz * scale;
  }

  const distance = Math.hypot(
    destination.x - camera.position.x,
    destination.z - camera.position.z,
  );

  if (
    !Number.isFinite(destination.x) ||
    !Number.isFinite(destination.y) ||
    !Number.isFinite(destination.z)
  ) {
    return { reach: "blocked", destination, distance, message: BLOCKED_MESSAGE };
  }
  return { reach: "reachable", destination, distance, message: null };
}

export type ModelFloorPick = {
  /** "floor" when the nearest visible model surface is a walkable floor. */
  status: "floor" | "no-floor";
  point: Vector3Tuple;
  /** Oriented (up-facing) world normal for marker orientation. */
  normal: Vector3Tuple;
  destination: Vector3Tuple;
  distance: number;
  objectName: string;
  horizontalScore: number;
  reach: FloorReach;
  /** Marker color/classification. "valid" only when reachable. */
  markerKind: FloorPickKind;
  message: string | null;
  /** Debug: why the surface was not treated as a floor. */
  rejection: string | null;
};

function reachToMarkerKind(reach: FloorReach): FloorPickKind {
  return reach === "reachable" ? "valid" : reach;
}

/**
 * Authoritative floor pick: NDC → ray → nearest visible model surface → floor
 * detection → reachability. Detection and reachability are kept distinct so the
 * caller can show a marker the instant a floor is found and only colour it by
 * reachability afterwards.
 */
export function pickModelFloor(
  camera: PerspectiveCamera,
  root: Object3D,
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  navigation: NavigationSettings,
  modelSize: ModelSize | null,
): ModelFloorPick {
  const far = Math.max(200, modelDiagonal(modelSize) * 3);
  const hit = pickModelSurface(camera, root, clientX, clientY, canvas, far);
  if (!hit || !hit.face) {
    return {
      status: "no-floor",
      point: [0, 0, 0],
      normal: [0, 1, 0],
      destination: [0, 0, 0],
      distance: Infinity,
      objectName: "",
      horizontalScore: 0,
      reach: "blocked",
      markerKind: "invalid",
      message: null,
      rejection: "no-hit",
    };
  }

  // Orient using the actual per-pixel ray (not the camera's centre forward),
  // otherwise the flip that separates floors from ceilings misfires for
  // off-centre pixels and reversed-wound floor triangles read as "faces-down".
  _rayDir.copy(raycaster.ray.direction);
  const detection = detectFloor(hit, _rayDir);
  const point: Vector3Tuple = [hit.point.x, hit.point.y, hit.point.z];
  const normal: Vector3Tuple = [
    detection.normal.x,
    detection.normal.y,
    detection.normal.z,
  ];

  if (!detection.isFloor) {
    return {
      status: "no-floor",
      point,
      normal,
      destination: [point[0], point[1] + navigation.eyeHeight, point[2]],
      distance: Infinity,
      objectName: detection.objectName,
      horizontalScore: detection.horizontalScore,
      reach: "blocked",
      markerKind: "invalid",
      message: null,
      rejection: detection.rejection,
    };
  }

  const reach = assessReach(hit.point, camera, navigation);
  return {
    status: "floor",
    point,
    normal,
    destination: reach.destination.toArray() as Vector3Tuple,
    distance: reach.distance,
    objectName: detection.objectName,
    horizontalScore: detection.horizontalScore,
    reach: reach.reach,
    markerKind: reachToMarkerKind(reach.reach),
    message: reach.message,
    rejection: null,
  };
}

export { _from as scratchFrom, _to as scratchTo, _offset as scratchOffset };
