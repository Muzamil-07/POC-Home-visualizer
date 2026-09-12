import {
  Camera,
  Matrix3,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  type Intersection,
} from "three";
import {
  MIN_TARGET_DISTANCE,
  WALKABLE_NORMAL_Y,
  type QuaternionTuple,
  type Vector3Tuple,
  type ViewpointPlacementDraft,
} from "@/types/tour";
import { modelDiagonal, type ModelSize } from "./editor-camera";

export function worldNormalFromIntersection(
  intersection: Intersection,
  rayDirection?: Vector3,
) {
  if (!intersection.face) return null;
  const normalMatrix = new Matrix3().getNormalMatrix(
    intersection.object.matrixWorld,
  );
  const worldNormal = intersection.face.normal
    .clone()
    .applyMatrix3(normalMatrix)
    .normalize();

  // SketchUp/GLB floors are often wound so the geometric normal points down.
  // Orient to the visible side of the hit before the walkable-Y test.
  if (rayDirection && worldNormal.dot(rayDirection) > 0) {
    worldNormal.negate();
  }

  return worldNormal;
}

export function isWalkableNormal(normal: Vector3) {
  return normal.y >= WALKABLE_NORMAL_Y;
}

export function lookAtQuaternion(from: Vector3, to: Vector3) {
  const dummy = new PerspectiveCamera();
  dummy.position.copy(from);
  dummy.up.set(0, 1, 0);
  dummy.lookAt(to);
  dummy.updateMatrix();
  return dummy.quaternion.clone();
}

export function createPlacementDraft(
  surfacePoint: Vector3,
  editorCamera: Camera,
  eyeHeight: number,
  fov: number,
  modelSize: ModelSize | null,
): ViewpointPlacementDraft {
  const cameraPosition = new Vector3(
    surfacePoint.x,
    surfacePoint.y + eyeHeight,
    surfacePoint.z,
  );

  const forward = new Vector3();
  editorCamera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) {
    forward.set(0, 0, -1);
  }
  forward.normalize();

  const targetDistance = Math.max(
    3,
    Math.min(8, modelDiagonal(modelSize) * 0.08),
  );
  const target = cameraPosition
    .clone()
    .add(forward.multiplyScalar(targetDistance));
  target.y = cameraPosition.y;

  const quaternion = lookAtQuaternion(cameraPosition, target);

  return {
    surfacePoint: [
      surfacePoint.x,
      surfacePoint.y,
      surfacePoint.z,
    ] as Vector3Tuple,
    position: cameraPosition.toArray() as Vector3Tuple,
    target: target.toArray() as Vector3Tuple,
    quaternion: quaternion.toArray() as QuaternionTuple,
    fov,
  };
}

export function applyEyeHeightToDraft(
  draft: ViewpointPlacementDraft,
  eyeHeight: number,
): ViewpointPlacementDraft {
  const y = draft.surfacePoint[1] + eyeHeight;
  return {
    ...draft,
    position: [draft.position[0], y, draft.position[2]],
    target: [draft.target[0], y, draft.target[2]],
  };
}

export function moveDraftTarget(
  draft: ViewpointPlacementDraft,
  nextTarget: Vector3,
): ViewpointPlacementDraft {
  const position = new Vector3(
    draft.position[0],
    draft.position[1],
    draft.position[2],
  );
  const target = nextTarget.clone();
  target.y = position.y;

  const offset = target.clone().sub(position);
  offset.y = 0;
  if (offset.lengthSq() < 1e-8) {
    const current = new Quaternion().fromArray(draft.quaternion);
    offset.set(0, 0, -1).applyQuaternion(current);
    offset.y = 0;
    if (offset.lengthSq() < 1e-8) {
      offset.set(0, 0, -1);
    }
  }
  if (offset.length() < MIN_TARGET_DISTANCE) {
    offset.setLength(MIN_TARGET_DISTANCE);
  }
  target.copy(position).add(offset);
  target.y = position.y;

  const quaternion = lookAtQuaternion(position, target);
  return {
    ...draft,
    target: target.toArray() as Vector3Tuple,
    quaternion: quaternion.toArray() as QuaternionTuple,
  };
}
