import {
  Box3,
  BufferGeometry,
  Mesh,
  Object3D,
  Raycaster,
  Vector3,
  type Material,
} from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import {
  DEFAULT_FOV,
  clampEyeHeight,
  clampFov,
  type QuaternionTuple,
  type Vector3Tuple,
  type ViewpointConfidence,
} from "@/types/tour";
import { lookAtQuaternion, worldNormalFromIntersection } from "@/components/viewer/placement";

export type SemanticRegionType =
  | "entrance"
  | "foyer"
  | "living"
  | "kitchen"
  | "dining"
  | "bedroom"
  | "bathroom"
  | "hallway"
  | "garage"
  | "room"
  | "unknown";

export interface TourGenerationOptions {
  eyeHeight: number;
  requestedStopCount: "auto" | number;
  frontOutward: Vector3Tuple;
}

export interface SemanticRegion {
  type: SemanticRegionType;
  name: string;
  bounds: Box3;
  confidence: ViewpointConfidence;
  sourceObjectName?: string;
}

export interface GeneratedTourCandidate {
  name: string;
  description: string;
  position: Vector3Tuple;
  target: Vector3Tuple;
  quaternion: QuaternionTuple;
  fov: number;
  confidence: ViewpointConfidence;
  suggestedType: string;
  source: "semantic" | "geometry";
}

export interface TourGenerationResult {
  candidates: GeneratedTourCandidate[];
  semanticRegions: SemanticRegion[];
  semanticNamesDiscovered: string[];
  floorCandidateCount: number;
  rejectedForClearance: number;
  durationMs: number;
  warning?: string;
}

type FloorCandidate = {
  floor: Vector3;
  camera: Vector3;
  clearance: number;
  score: number;
  minWall: number;
  enclosed: number;
  openDir: Vector3;
};

type ProgressFn = (message: string) => void;

const SEMANTIC_PATTERNS: Array<{
  type: SemanticRegionType;
  label: string;
  pattern: RegExp;
}> = [
  { type: "entrance", label: "Entrance", pattern: /entrance|entry|front.?door|main.?door/ },
  { type: "foyer", label: "Foyer", pattern: /foyer|lobby|vestibule/ },
  { type: "living", label: "Living Room", pattern: /living|lounge|family.?room/ },
  { type: "kitchen", label: "Kitchen", pattern: /kitchen|pantry/ },
  { type: "dining", label: "Dining Room", pattern: /dining/ },
  { type: "bedroom", label: "Bedroom", pattern: /bed(room)?|master|guest.?room/ },
  { type: "bathroom", label: "Bathroom", pattern: /bath|toilet|wc|powder/ },
  { type: "hallway", label: "Hallway", pattern: /hall|corridor/ },
  { type: "garage", label: "Garage", pattern: /garage/ },
];

const GENERIC_MATERIAL = /^(default|material|color|white|black|grey|gray|wood|paint|standard)/;
const MAX_SAMPLE_CELLS = 10_000;
const MAX_INTERIOR_HEIGHT = 8;
const HORIZONTAL_DIRS = 8;
const MIN_WALL_DISTANCE = 0.32;
const REVIEW_DESCRIPTION =
  "Automatically generated interior viewpoint. Review its position, direction and room name.";
const FIXED_HEAD_DESCRIPTION =
  "Fixed authored template camera. This stop stays the same on every generate.";

const FIXED_TEMPLATE_HEAD: Array<{
  name: string;
  position: Vector3Tuple;
  target: Vector3Tuple;
  fov: number;
  suggestedType: string;
}> = [
  {
    name: "Viewpoint 1",
    position: [2.7009, 6.7338, 3.70066],
    target: [1.6877, 6.5266, -5.088],
    fov: 46,
    suggestedType: "entrance",
  },
  {
    name: "Viewpoint 2",
    position: [1.6877, 6.5266, -5.088],
    target: [-2.988, 7.0332, -12.0552],
    fov: 59,
    suggestedType: "foyer",
  },
  {
    name: "Viewpoint 3",
    position: [-2.988, 7.0332, -12.0552],
    target: [3.2666, 7.6133, -5.0004],
    fov: 46,
    suggestedType: "hallway",
  },
  {
    name: "Viewpoint 4",
    position: [3.2666, 7.6133, -5.0004],
    target: [9.1888, 7.6688, -8.0444],
    fov: 46,
    suggestedType: "living",
  },
  {
    name: "Viewpoint 5",
    position: [9.1888, 7.6688, -8.0444],
    target: [5.5, 7.45, -8.2],
    fov: 60,
    suggestedType: "kitchen",
  },
];

// Smooth CameraControls interpolation between generated stops may still cross
// walls. Authored path waypoints or fade transitions can be added later; this
// milestone only orders viewpoints and does not compute collision-free paths.

let bvhPatched = false;

function ensureAcceleratedRaycast() {
  if (bvhPatched) return;
  const geometryPrototype = BufferGeometry.prototype as unknown as {
    computeBoundsTree: typeof computeBoundsTree;
    disposeBoundsTree: typeof disposeBoundsTree;
  };
  geometryPrototype.computeBoundsTree = computeBoundsTree;
  geometryPrototype.disposeBoundsTree = disposeBoundsTree;
  (Mesh.prototype as unknown as { raycast: typeof acceleratedRaycast }).raycast =
    acceleratedRaycast;
  bvhPatched = true;
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function horizontal(vector: Vector3) {
  vector.y = 0;
  return vector;
}

function finiteTuple(tuple: Vector3Tuple) {
  return tuple.every((value) => Number.isFinite(value));
}

function boxVolume(box: Box3) {
  const size = box.getSize(new Vector3());
  return Math.max(0, size.x) * Math.max(0, size.y) * Math.max(0, size.z);
}

function yieldFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function collectNameSources(object: Object3D) {
  const names: Array<{ text: string; weight: ViewpointConfidence }> = [];
  let current: Object3D | null = object;
  let depth = 0;
  while (current && depth < 6) {
    if (current.name) {
      names.push({
        text: current.name,
        weight: depth === 0 ? "high" : "medium",
      });
    }
    const data = current.userData as Record<string, unknown> | undefined;
    for (const key of ["name", "label", "title", "gltfExtras"]) {
      const value = data?.[key];
      if (typeof value === "string" && value.trim()) {
        names.push({ text: value, weight: "medium" });
      }
    }
    current = current.parent;
    depth += 1;
  }

  if (isMesh(object)) {
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      const materialName = (material as Material | undefined)?.name;
      if (materialName && !GENERIC_MATERIAL.test(materialName.toLowerCase())) {
        names.push({ text: materialName, weight: "low" });
      }
    }
  }

  return names;
}

function matchSemantic(text: string) {
  const normalized = text.toLowerCase();
  return SEMANTIC_PATTERNS.find((entry) => entry.pattern.test(normalized));
}

export function analyzeSemanticRegions(root: Object3D) {
  const discovered = new Set<string>();
  const regions: SemanticRegion[] = [];

  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    const sources = collectNameSources(object);
    for (const source of sources) {
      const match = matchSemantic(source.text);
      if (!match) continue;
      discovered.add(source.text);
      const bounds = new Box3().setFromObject(object);
      if (bounds.isEmpty()) continue;
      const size = bounds.getSize(new Vector3());
      if (size.x < 0.2 && size.y < 0.2 && size.z < 0.2) continue;
      regions.push({
        type: match.type,
        name: match.label,
        bounds,
        confidence: source.weight,
        sourceObjectName: object.name || source.text,
      });
      break;
    }
  });

  const merged: SemanticRegion[] = [];
  for (const region of regions.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.confidence] - rank[b.confidence];
  })) {
    const overlap = merged.find((existing) => {
      if (existing.type !== region.type) return false;
      const intersection = existing.bounds.clone().intersect(region.bounds);
      if (intersection.isEmpty()) return false;
      const volume = boxVolume(intersection);
      const smaller = Math.min(boxVolume(existing.bounds), boxVolume(region.bounds));
      return smaller > 0 && volume / smaller > 0.55;
    });
    if (overlap) {
      overlap.bounds.union(region.bounds);
      if (
        region.confidence === "high" &&
        overlap.confidence !== "high"
      ) {
        overlap.confidence = region.confidence;
        overlap.name = region.name;
        overlap.sourceObjectName = region.sourceObjectName;
      }
      continue;
    }
    merged.push({
      ...region,
      bounds: region.bounds.clone(),
    });
  }

  return {
    regions: merged,
    semanticNamesDiscovered: [...discovered],
  };
}

type BvhGeometry = BufferGeometry & {
  boundsTree?: unknown;
  computeBoundsTree?: () => void;
  disposeBoundsTree?: () => void;
};

function asBvhGeometry(geometry: BufferGeometry) {
  return geometry as BvhGeometry;
}

function uniqueGeometries(root: Object3D) {
  const seen = new Set<BufferGeometry>();
  const list: BufferGeometry[] = [];
  root.traverse((object) => {
    if (!isMesh(object) || !object.geometry) return;
    if (seen.has(object.geometry)) return;
    seen.add(object.geometry);
    const count = object.geometry.getAttribute("position")?.count ?? 0;
    if (count < 12) return;
    list.push(object.geometry);
  });
  return list;
}

function modelComplexity(root: Object3D) {
  let originalMeshes = 0;
  let meshCount = 0;
  let vertexCount = 0;
  root.traverse((object) => {
    const marked = object.userData.originalMeshCount;
    if (typeof marked === "number") {
      originalMeshes = Math.max(originalMeshes, marked);
    }
    if (!isMesh(object) || !object.geometry) return;
    meshCount += 1;
    vertexCount += object.geometry.getAttribute("position")?.count ?? 0;
  });
  return {
    meshCount: originalMeshes || meshCount,
    drawCalls: meshCount,
    vertexCount,
  };
}

async function ensureBoundsTrees(root: Object3D, onProgress: ProgressFn) {
  ensureAcceleratedRaycast();
  const geometries = uniqueGeometries(root);
  for (let index = 0; index < geometries.length; index += 1) {
    const geometry = asBvhGeometry(geometries[index]!);
    const verts = geometry.getAttribute("position")?.count ?? 0;
    if (!geometry.boundsTree) {
      geometry.computeBoundsTree?.();
    }
    if (verts > 80_000 || index % 2 === 0) {
      onProgress(
        `Indexing collision… ${Math.min(99, Math.round(((index + 1) / Math.max(geometries.length, 1)) * 100))}%`,
      );
      await yieldFrame();
    }
  }
}

export function disposeTemplateBoundsTrees(root: Object3D | null) {
  if (!root) return;
  root.traverse((object) => {
    if (!isMesh(object) || !object.geometry) return;
    const geometry = asBvhGeometry(object.geometry);
    if (geometry.boundsTree) {
      geometry.disposeBoundsTree?.();
    }
  });
}

function poseFromLook(
  position: Vector3,
  target: Vector3,
  fov: number,
): Pick<
  GeneratedTourCandidate,
  "position" | "target" | "quaternion" | "fov"
> {
  const lookTarget = target.clone();
  if (position.distanceTo(lookTarget) < 0.2) {
    lookTarget.add(new Vector3(0, 0, -2));
  }
  const quaternion = lookAtQuaternion(position, lookTarget);
  return {
    position: position.toArray() as Vector3Tuple,
    target: lookTarget.toArray() as Vector3Tuple,
    quaternion: quaternion.toArray() as QuaternionTuple,
    fov: clampFov(fov),
  };
}

function horizontalClearance(
  raycaster: Raycaster,
  root: Object3D,
  origin: Vector3,
  direction: Vector3,
  far: number,
) {
  raycaster.firstHitOnly = false;
  raycaster.far = far;
  raycaster.near = 0.02;
  raycaster.set(origin, direction);
  const hits = raycaster.intersectObject(root, true);
  for (const hit of hits) {
    if (!hit.face || hit.distance < 0.04) continue;
    const normal = worldNormalFromIntersection(hit, direction);
    if (!normal) continue;
    // Floors and roofs are not walls; grazing the slab made outdoor pads
    // look enclosed.
    if (Math.abs(normal.y) > 0.55) continue;
    return hit.distance;
  }
  return far;
}

function scoreCandidate(
  raycaster: Raycaster,
  root: Object3D,
  camera: Vector3,
  floor: Vector3,
  clearance: number,
  eyeHeight: number,
  buildingSize: number,
  enclosureLimit: number,
): Omit<FloorCandidate, "floor" | "camera" | "clearance"> | null {
  const down = new Vector3(0, -1, 0);
  raycaster.firstHitOnly = true;
  raycaster.near = 0.02;
  raycaster.far = eyeHeight + 0.6;
  raycaster.set(camera, down);
  const floorHit = raycaster.intersectObject(root, true)[0];
  raycaster.firstHitOnly = false;
  if (!floorHit) return null;
  if (Math.abs(floorHit.distance - eyeHeight) > 0.55) return null;

  const up = new Vector3(0, 1, 0);
  raycaster.firstHitOnly = true;
  raycaster.near = 0.05;
  raycaster.far = Math.max(clearance - 0.05, eyeHeight);
  raycaster.set(camera, up);
  const ceilingHit = raycaster.intersectObject(root, true)[0];
  raycaster.firstHitOnly = false;
  if (!ceilingHit) return null;

  const distances: number[] = [];
  const openDir = new Vector3();
  let bestOpen = 0;
  let tight = 0;
  let openSky = 0;
  let enclosed = 0;

  for (let index = 0; index < HORIZONTAL_DIRS; index += 1) {
    const angle = (index / HORIZONTAL_DIRS) * Math.PI * 2;
    const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const distance = horizontalClearance(
      raycaster,
      root,
      camera,
      direction,
      buildingSize,
    );
    distances.push(distance);
    if (distance < MIN_WALL_DISTANCE) return null;
    if (distance < 0.45) tight += 1;
    if (distance <= enclosureLimit) enclosed += 1;
    if (distance > enclosureLimit * 1.7) openSky += 1;
    if (distance > bestOpen) {
      bestOpen = distance;
      openDir.copy(direction);
    }
  }

  const minWall = Math.min(...distances);
  const avg =
    distances.reduce((sum, value) => sum + value, 0) / distances.length;

  if (tight >= 5) return null;
  if (enclosed < 4) return null;
  if (openSky >= 4) return null;
  if (avg > enclosureLimit) return null;

  const score =
    enclosed * 0.7 +
    minWall * 0.9 +
    avg * 0.18 +
    Math.min(clearance, 3.4) * 0.45 -
    tight * 0.4 -
    openSky * 0.35;

  void floor;
  return { score, minWall, enclosed, openDir: openDir.clone() };
}

async function sampleInteriorFloors(
  root: Object3D,
  box: Box3,
  eyeHeight: number,
  onProgress: ProgressFn,
) {
  const size = box.getSize(new Vector3());
  let step = clamp(Math.min(size.x, size.z) / 45, 0.35, 1);
  const complexity = modelComplexity(root);
  const maxCells =
    complexity.vertexCount > 2_000_000 || complexity.meshCount > 400
      ? 2_800
      : complexity.meshCount > 120
        ? 5_000
        : MAX_SAMPLE_CELLS;
  let cellsX = Math.max(1, Math.ceil(size.x / step));
  let cellsZ = Math.max(1, Math.ceil(size.z / step));
  while (cellsX * cellsZ > maxCells) {
    step *= 1.12;
    cellsX = Math.max(1, Math.ceil(size.x / step));
    cellsZ = Math.max(1, Math.ceil(size.z / step));
  }

  const raycaster = new Raycaster();
  raycaster.firstHitOnly = false;
  const origin = new Vector3();
  const down = new Vector3(0, -1, 0);
  const candidates: FloorCandidate[] = [];
  let rejectedForClearance = 0;
  let processed = 0;
  const total = cellsX * cellsZ;
  const buildingSize = Math.max(size.x, size.z, 8);
  const enclosureLimit = clamp(Math.min(size.x, size.z) * 0.26, 5.5, 12);
  const borderMargin = clamp(Math.min(size.x, size.z) * 0.07, 1.6, 3.2);
  const minY = box.min.y - 0.5;
  const startY = box.max.y + 2.5;
  const far = startY - minY + 2;

  for (let ix = 0; ix < cellsX; ix += 1) {
    const x = box.min.x + (ix + 0.5) * (size.x / cellsX);
    for (let iz = 0; iz < cellsZ; iz += 1) {
      const z = box.min.z + (iz + 0.5) * (size.z / cellsZ);
      if (
        x < box.min.x + borderMargin ||
        x > box.max.x - borderMargin ||
        z < box.min.z + borderMargin ||
        z > box.max.z - borderMargin
      ) {
        processed += 1;
        continue;
      }
      origin.set(x, startY, z);
      raycaster.near = 0;
      raycaster.far = far;
      raycaster.firstHitOnly = false;
      raycaster.set(origin, down);
      const hits = raycaster.intersectObject(root, true);
      processed += 1;

      for (let index = 1; index < hits.length; index += 1) {
        const hit = hits[index];
        if (!hit?.face) continue;
        const normal = worldNormalFromIntersection(hit, down);
        if (!normal || normal.y < 0.7) continue;
        const above = hits[index - 1];
        if (!above) {
          rejectedForClearance += 1;
          continue;
        }
        const clearance = above.point.y - hit.point.y;
        if (clearance < eyeHeight + 0.25 || clearance > MAX_INTERIOR_HEIGHT) {
          rejectedForClearance += 1;
          continue;
        }
        const camera = new Vector3(
          hit.point.x,
          hit.point.y + eyeHeight,
          hit.point.z,
        );
        const scored = scoreCandidate(
          raycaster,
          root,
          camera,
          hit.point,
          clearance,
          eyeHeight,
          buildingSize,
          enclosureLimit,
        );
        if (!scored) {
          rejectedForClearance += 1;
          continue;
        }
        candidates.push({
          floor: hit.point.clone(),
          camera,
          clearance,
          ...scored,
        });
      }

      if (processed % 60 === 0) {
        onProgress(
          `Finding interior floors… ${Math.min(99, Math.round((processed / total) * 100))}%`,
        );
        await yieldFrame();
      }
    }
  }

  return { candidates, rejectedForClearance, gridStep: size.x / cellsX };
}

function pickNearest(
  candidates: FloorCandidate[],
  point: Vector3,
  minScore = -Infinity,
) {
  let best: FloorCandidate | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (candidate.score < minScore) continue;
    const dx = candidate.camera.x - point.x;
    const dz = candidate.camera.z - point.z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function takeCandidate(list: FloorCandidate[], candidate: FloorCandidate | null) {
  if (!candidate) return null;
  const index = list.indexOf(candidate);
  if (index >= 0) list.splice(index, 1);
  return candidate;
}

function farthestPointSample(
  pool: FloorCandidate[],
  count: number,
  seeds: Vector3[],
  minSeparation: number,
) {
  const chosen: FloorCandidate[] = [];
  const remaining = [...pool];

  while (chosen.length < count && remaining.length > 0) {
    let best: FloorCandidate | null = null;
    let bestDistance = -1;
    for (const candidate of remaining) {
      let nearest = Infinity;
      for (const seed of seeds) {
        const dx = candidate.camera.x - seed.x;
        const dz = candidate.camera.z - seed.z;
        nearest = Math.min(nearest, Math.hypot(dx, dz));
      }
      for (const existing of chosen) {
        const dx = candidate.camera.x - existing.camera.x;
        const dz = candidate.camera.z - existing.camera.z;
        nearest = Math.min(nearest, Math.hypot(dx, dz));
      }
      const ranked = nearest + candidate.score * 0.08;
      if (ranked > bestDistance && nearest >= minSeparation * 0.45) {
        best = candidate;
        bestDistance = ranked;
      }
    }
    if (!best) break;
    const dx0 = seeds.length
      ? Math.min(
          ...seeds.map((seed) =>
            Math.hypot(best!.camera.x - seed.x, best!.camera.z - seed.z),
          ),
        )
      : Infinity;
    const tooClose = chosen.some(
      (existing) =>
        Math.hypot(
          existing.camera.x - best!.camera.x,
          existing.camera.z - best!.camera.z,
        ) < minSeparation,
    );
    takeCandidate(remaining, best);
    if (tooClose || dx0 < minSeparation * 0.55) continue;
    chosen.push(best);
  }

  return chosen;
}

function nearestNeighborOrder(start: Vector3, points: FloorCandidate[]) {
  const remaining = [...points];
  const ordered: FloorCandidate[] = [];
  const current = start.clone();
  while (remaining.length > 0) {
    const next = pickNearest(remaining, current);
    if (!next) break;
    takeCandidate(remaining, next);
    ordered.push(next);
    current.copy(next.camera);
  }
  return ordered;
}

function lookTargetFor(
  camera: Vector3,
  preferred: Vector3 | null,
  fallback: Vector3,
  openDir: Vector3,
  eyeHeight: number,
) {
  if (preferred) {
    const target = preferred.clone();
    target.y = eyeHeight;
    if (Math.hypot(target.x - camera.x, target.z - camera.z) > 0.4) {
      return target;
    }
  }
  if (openDir.lengthSq() > 0.01) {
    return camera.clone().addScaledVector(openDir.clone().normalize(), 4);
  }
  const toward = fallback.clone();
  toward.y = camera.y;
  if (toward.distanceTo(camera) < 0.4) {
    toward.add(new Vector3(0, 0, -3));
  }
  return toward;
}

function makeCandidate(
  name: string,
  description: string,
  position: Vector3,
  target: Vector3,
  fov: number,
  confidence: ViewpointConfidence,
  suggestedType: string,
  source: "semantic" | "geometry",
): GeneratedTourCandidate | null {
  const pose = poseFromLook(position, target, fov);
  if (!finiteTuple(pose.position) || !finiteTuple(pose.target)) return null;
  if (
    pose.position[0] === pose.target[0] &&
    pose.position[1] === pose.target[1] &&
    pose.position[2] === pose.target[2]
  ) {
    return null;
  }
  return {
    name,
    description,
    ...pose,
    confidence,
    suggestedType,
    source,
  };
}

function frontBoundaryPoint(box: Box3, frontOutward: Vector3) {
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const extent =
    Math.abs(frontOutward.x) * (size.x / 2) +
    Math.abs(frontOutward.z) * (size.z / 2);
  return center.addScaledVector(frontOutward, extent);
}

export function resolveFrontOutward(
  cameraPosition: Vector3,
  cameraForward: Vector3,
  modelCenter: Vector3,
) {
  const outward = cameraPosition.clone().sub(modelCenter);
  horizontal(outward);
  if (outward.lengthSq() > 0.04) {
    return outward.normalize();
  }
  const fallback = cameraForward.clone().multiplyScalar(-1);
  horizontal(fallback);
  if (fallback.lengthSq() > 0.0001) {
    return fallback.normalize();
  }
  return new Vector3(0, 0, 1);
}

export async function generateTemplateTour(
  root: Object3D,
  options: TourGenerationOptions,
  onProgress: ProgressFn = () => {},
): Promise<TourGenerationResult> {
  const started = performance.now();
  const eyeHeight = clampEyeHeight(options.eyeHeight);
  const frontOutward = new Vector3(
    options.frontOutward[0],
    0,
    options.frontOutward[2],
  );
  if (frontOutward.lengthSq() < 0.0001) {
    frontOutward.set(0, 0, 1);
  } else {
    frontOutward.normalize();
  }

  onProgress("Analyzing model…");
  root.updateWorldMatrix(true, true);
  await ensureBoundsTrees(root, onProgress);
  await yieldFrame();
  const box = new Box3().setFromObject(root);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const diagonal = Math.hypot(size.x, size.y, size.z);
  const expanded = box.clone().expandByScalar(Math.max(18, diagonal * 0.25));

  const semantic = analyzeSemanticRegions(root);
  await yieldFrame();

  onProgress("Finding interior floors…");
  const sampled = await sampleInteriorFloors(root, box, eyeHeight, onProgress);
  const pool = [...sampled.candidates].sort((a, b) => b.score - a.score);

  onProgress("Creating tour sequence…");
  const candidates: GeneratedTourCandidate[] = [];
  const usedSeeds: Vector3[] = [];
  const inward = frontOutward.clone().multiplyScalar(-1);
  const frontPoint = frontBoundaryPoint(box, frontOutward);
  const entranceAnchor = frontPoint.clone().addScaledVector(inward, 1.4);
  entranceAnchor.y = eyeHeight;

  for (const stop of FIXED_TEMPLATE_HEAD) {
    const created = makeCandidate(
      stop.name,
      FIXED_HEAD_DESCRIPTION,
      new Vector3(...stop.position),
      new Vector3(...stop.target),
      stop.fov,
      "high",
      stop.suggestedType,
      "geometry",
    );
    if (!created) continue;
    candidates.push(created);
    usedSeeds.push(new Vector3(...stop.position));
    const nearby = pickNearest(pool, new Vector3(...stop.position));
    if (
      nearby &&
      Math.hypot(
        nearby.camera.x - stop.position[0],
        nearby.camera.z - stop.position[2],
      ) < 2.4
    ) {
      takeCandidate(pool, nearby);
    }
  }

  const minSeparation = clamp(Math.min(size.x, size.z) * 0.08, 2.2, 4.6);
  const usableArea = sampled.candidates.length * sampled.gridStep * sampled.gridStep;
  const autoInterior = clamp(Math.round(usableArea / 14), 5, 12);
  let interiorBudget =
    options.requestedStopCount === "auto"
      ? autoInterior
      : Math.max(0, options.requestedStopCount - candidates.length);

  const semanticStops: GeneratedTourCandidate[] = [];
  const semanticTypesUsed = new Set<SemanticRegionType>();
  for (const region of semantic.regions) {
    if (region.type === "entrance" || region.type === "foyer") continue;
    if (semanticTypesUsed.has(region.type) && region.type !== "bedroom") {
      continue;
    }
    const regionCenter = region.bounds.getCenter(new Vector3());
    const nearby = pickNearest(
      pool.filter((candidate) => region.bounds.containsPoint(candidate.camera) ||
        Math.hypot(
          candidate.camera.x - regionCenter.x,
          candidate.camera.z - regionCenter.z,
        ) < 3.5),
      new Vector3(regionCenter.x, eyeHeight, regionCenter.z),
    ) ?? pickNearest(pool, new Vector3(regionCenter.x, eyeHeight, regionCenter.z));
    if (!nearby) continue;
    const created = makeCandidate(
      region.name,
      `Suggested ${region.name.toLowerCase()} viewpoint from scene naming. Review before presenting.`,
      nearby.camera,
      lookTargetFor(
        nearby.camera,
        new Vector3(regionCenter.x, nearby.camera.y, regionCenter.z),
        center,
        nearby.openDir,
        nearby.camera.y,
      ),
      DEFAULT_FOV,
      region.confidence,
      region.type,
      "semantic",
    );
    if (!created) continue;
    takeCandidate(pool, nearby);
    semanticStops.push(created);
    usedSeeds.push(nearby.camera.clone());
    semanticTypesUsed.add(region.type);
  }

  const remainingBudget = Math.max(0, interiorBudget - semanticStops.length);
  const hasKitchen = semanticStops.some((item) => item.suggestedType === "kitchen");
  const rearAnchor = center.clone().addScaledVector(frontOutward, -Math.max(size.x, size.z) * 0.28);
  rearAnchor.y = eyeHeight;
  if (!hasKitchen && remainingBudget > 0) {
    const rearPool = pool.filter((candidate) => {
      const offset = candidate.camera.clone().sub(center);
      return offset.dot(frontOutward) < 0;
    });
    const kitchenFloor =
      pickNearest(rearPool.length ? rearPool : pool, rearAnchor);
    if (kitchenFloor) {
      const created = makeCandidate(
        "Kitchen Candidate",
        REVIEW_DESCRIPTION,
        kitchenFloor.camera,
        lookTargetFor(kitchenFloor.camera, center, center, kitchenFloor.openDir, kitchenFloor.camera.y),
        DEFAULT_FOV,
        "low",
        "kitchen",
        "geometry",
      );
      if (created) {
        takeCandidate(pool, kitchenFloor);
        semanticStops.push(created);
        usedSeeds.push(kitchenFloor.camera.clone());
        interiorBudget = Math.max(interiorBudget, semanticStops.length);
      }
    }
  }

  const fillCount = Math.max(0, interiorBudget - semanticStops.length);
  const sampledFill = farthestPointSample(
    pool,
    fillCount,
    usedSeeds.length ? usedSeeds : [entranceAnchor],
    minSeparation,
  );
  const geometryStops: GeneratedTourCandidate[] = [];
  let interiorIndex = 1;
  let roomIndex = 1;
  for (const [index, floor] of sampledFill.entries()) {
    const isolated =
      floor.minWall > 1.2 &&
      floor.clearance < 3.2 &&
      roomIndex <= 2 &&
      index >= Math.max(0, sampledFill.length - 2);
    const name = isolated
      ? `Room Candidate ${roomIndex++}`
      : `Interior Area ${interiorIndex++}`;
    const created = makeCandidate(
      name,
      REVIEW_DESCRIPTION,
      floor.camera,
      lookTargetFor(floor.camera, null, center, floor.openDir, floor.camera.y),
      DEFAULT_FOV,
      "low",
      isolated ? "bedroom" : "unknown",
      "geometry",
    );
    if (!created) continue;
    takeCandidate(pool, floor);
    geometryStops.push(created);
    usedSeeds.push(floor.camera.clone());
  }

  const interiorCandidates = [...semanticStops, ...geometryStops];
  const start =
    usedSeeds[1]?.clone() ??
    usedSeeds[0]?.clone() ??
    entranceAnchor;
  const interiorFloors = interiorCandidates
    .map((item) => {
      const match = [...sampled.candidates].find(
        (candidate) =>
          Math.hypot(
            candidate.camera.x - item.position[0],
            candidate.camera.z - item.position[2],
          ) < 0.05,
      );
      return match
        ? { candidate: item, floor: match }
        : {
            candidate: item,
            floor: {
              camera: new Vector3(...item.position),
              floor: new Vector3(...item.position),
              clearance: 2.5,
              score: 1,
              minWall: 1,
              enclosed: 4,
              openDir: inward.clone(),
            } satisfies FloorCandidate,
          };
    });
  const orderedFloors = nearestNeighborOrder(
    start,
    interiorFloors.map((item) => item.floor),
  );
  const orderedInterior = orderedFloors
    .map(
      (floor) =>
        interiorFloors.find(
          (item) =>
            Math.hypot(
              item.floor.camera.x - floor.camera.x,
              item.floor.camera.z - floor.camera.z,
            ) < 0.05,
        )?.candidate,
    )
    .filter((item): item is GeneratedTourCandidate => Boolean(item));
  for (const leftover of interiorCandidates) {
    if (!orderedInterior.includes(leftover)) orderedInterior.push(leftover);
  }
  candidates.push(...orderedInterior);

  let areaNumber = 1;
  for (const candidate of candidates) {
    if (candidate.name.startsWith("Interior Area ")) {
      candidate.name = `Interior Area ${areaNumber}`;
      areaNumber += 1;
    }
  }

  const valid = candidates.filter((candidate) => {
    const position = new Vector3(...candidate.position);
    return (
      finiteTuple(candidate.position) &&
      finiteTuple(candidate.target) &&
      expanded.containsPoint(position)
    );
  });

  let warning: string | undefined;
  if (sampled.candidates.length === 0) {
    warning =
      "The model does not expose enough interior floor geometry for automatic placement. Use Place Viewpoint to add interior views manually.";
  } else if (valid.length <= 1) {
    warning =
      "Only the exterior viewpoint could be placed automatically. Use Place Viewpoint to add interior views manually.";
  } else if (valid.length < 4) {
    warning =
      "A partial template was created because only some interior camera positions were valid.";
  }

  return {
    candidates: valid,
    semanticRegions: semantic.regions,
    semanticNamesDiscovered: semantic.semanticNamesDiscovered,
    floorCandidateCount: sampled.candidates.length,
    rejectedForClearance: sampled.rejectedForClearance,
    durationMs: Math.round(performance.now() - started),
    warning,
  };
}

export function generationStatsSummary(result: TourGenerationResult) {
  return {
    semanticNames: result.semanticNamesDiscovered,
    semanticRegions: result.semanticRegions.map((region) => ({
      name: region.name,
      type: region.type,
      confidence: region.confidence,
      source: region.sourceObjectName,
    })),
    floorCandidates: result.floorCandidateCount,
    generated: result.candidates.length,
    fromMetadata: result.candidates.filter((item) => item.source === "semantic"),
    heuristic: result.candidates.filter((item) => item.source === "geometry"),
    rejectedForClearance: result.rejectedForClearance,
    durationMs: result.durationMs,
  };
}
