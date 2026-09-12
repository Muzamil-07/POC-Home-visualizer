import {
  Material,
  Mesh,
  Object3D,
  Plane,
  Vector3,
  type Intersection,
} from "three";
import type { SectionBounds } from "@/types/tour";
import { isWalkableNormal, worldNormalFromIntersection } from "./placement";

export const sectionPlane = new Plane(new Vector3(0, -1, 0), 0);

type MaterialClipSnapshot = {
  clippingPlanes: Plane[] | null;
  clipShadows: boolean;
};

const previousClip = new WeakMap<Material, MaterialClipSnapshot>();
const clippedMaterials = new Set<Material>();

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function getMaterials(mesh: Mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

export function sectionBoundsFromSize(height: number): SectionBounds {
  const modelHeight = Math.max(height, 0.01);
  return {
    minY: 0,
    maxY: modelHeight,
    modelHeight,
  };
}

export function defaultSectionHeight(bounds: SectionBounds) {
  return bounds.minY + bounds.modelHeight * 0.6;
}

export function sectionStep(bounds: SectionBounds) {
  return Math.max(0.01, bounds.modelHeight / 200);
}

export function clampSectionHeight(height: number, bounds: SectionBounds) {
  return Math.min(bounds.maxY, Math.max(bounds.minY, height));
}

export function setSectionPlaneHeight(height: number) {
  sectionPlane.normal.set(0, -1, 0);
  sectionPlane.constant = height;
}

function collectMaterials(root: Object3D) {
  const unique = new Set<Material>();
  root.traverse((object) => {
    if (!isMesh(object)) return;
    for (const material of getMaterials(object)) {
      unique.add(material);
    }
  });
  return unique;
}

export function applySectionClipping(root: Object3D, plane: Plane) {
  for (const material of collectMaterials(root)) {
    if (!previousClip.has(material)) {
      previousClip.set(material, {
        clippingPlanes: material.clippingPlanes,
        clipShadows: material.clipShadows,
      });
      clippedMaterials.add(material);
    }
    material.clippingPlanes = [plane];
    material.clipShadows = true;
    material.needsUpdate = true;
  }
}

export function restoreSectionClipping(root: Object3D | null) {
  const materials = root ? collectMaterials(root) : new Set(clippedMaterials);
  for (const material of materials) {
    const previous = previousClip.get(material);
    if (!previous) continue;
    material.clippingPlanes = previous.clippingPlanes;
    material.clipShadows = previous.clipShadows;
    material.needsUpdate = true;
    previousClip.delete(material);
    clippedMaterials.delete(material);
  }
  if (!root) {
    clippedMaterials.clear();
  }
}

export function findVisiblePlacementIntersection({
  intersections,
  sectionEnabled,
  sectionHeight,
  modelHeight,
  rayDirection,
}: {
  intersections: Intersection[];
  sectionEnabled: boolean;
  sectionHeight: number;
  modelHeight: number;
  rayDirection?: Vector3;
}) {
  const epsilon = Math.max(0.001, modelHeight * 0.0001);

  for (const intersection of intersections) {
    if (!(intersection.object as Mesh).isMesh || !intersection.face) continue;
    if (sectionEnabled && intersection.point.y > sectionHeight + epsilon) {
      continue;
    }

    const worldNormal = worldNormalFromIntersection(
      intersection,
      rayDirection,
    );
    if (!worldNormal) continue;

    return {
      intersection,
      worldNormal,
      walkable: isWalkableNormal(worldNormal),
    };
  }

  return null;
}
