import { BufferGeometry, Mesh, Object3D } from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";

type BvhGeometry = BufferGeometry & {
  boundsTree?: unknown;
  computeBoundsTree?: typeof computeBoundsTree;
  disposeBoundsTree?: typeof disposeBoundsTree;
};

let patched = false;

export function ensureAcceleratedRaycast() {
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

export function ensureModelBoundsTrees(root: Object3D) {
  ensureAcceleratedRaycast();
  const seen = new Set<BufferGeometry>();
  root.traverse((object) => {
    if (!isMesh(object) || !object.geometry) return;
    if (seen.has(object.geometry)) return;
    seen.add(object.geometry);
    const geometry = object.geometry as BvhGeometry;
    if (!geometry.boundsTree) {
      geometry.computeBoundsTree?.();
    }
  });
}
