import { Raycaster, Vector3 } from "three";
import { getGlbRoot } from "@/components/viewer/glb-root";
import { findVisiblePlacementIntersection } from "@/components/viewer/section";
import { useTourStore } from "@/store/tour-store";
import type { Vector3Tuple } from "@/types/tour";

const raycaster = new Raycaster();
const origin = new Vector3();
const down = new Vector3(0, -1, 0);

export function snapWorldPointToFloor(
  position: Vector3,
  modelHeight: number,
): Vector3 | null {
  const root = getGlbRoot();
  if (!root) return null;
  root.updateWorldMatrix(true, true);
  raycaster.firstHitOnly = false;
  origin.set(position.x, position.y + 2.4, position.z);
  raycaster.set(origin, down);
  const intersections = raycaster.intersectObject(root, true);
  const store = useTourStore.getState();
  const hit = findVisiblePlacementIntersection({
    intersections,
    sectionEnabled:
      store.appMode === "edit" && store.section.enabled && Boolean(root),
    sectionHeight: store.section.height,
    modelHeight,
    rayDirection: raycaster.ray.direction,
  });
  if (!hit || !hit.walkable) return null;
  return hit.intersection.point;
}

export function tupleFromVector(point: Vector3): Vector3Tuple {
  return [point.x, point.y, point.z];
}
