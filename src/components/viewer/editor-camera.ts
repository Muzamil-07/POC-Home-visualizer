import {
  Box3,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import type { CameraControlsImpl } from "@react-three/drei";
import {
  PREVIEW_DURATION_SECONDS,
  type EditorCameraSnapshot,
  type QuaternionTuple,
  type TourViewpoint,
  type Vector3Tuple,
} from "@/types/tour";

export type ModelSize = {
  width: number;
  height: number;
  depth: number;
};

type EditorCameraApi = {
  capture: () => EditorCameraSnapshot | null;
  enterTour: (viewpointId: string) => Promise<void>;
  enterExplore: () => Promise<void>;
  goToTourViewpoint: (viewpointId: string) => Promise<void>;
  exitTour: () => Promise<void>;
  frameOverview: (animate?: boolean) => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  applyClipping: (size: ModelSize) => void;
};

let editorCamera: EditorCameraApi | null = null;

const editorCameraRegistry = globalThis as typeof globalThis & {
  __pocEditorCamera?: EditorCameraApi | null;
};

export function registerEditorCamera(api: EditorCameraApi | null) {
  editorCamera = api;
  editorCameraRegistry.__pocEditorCamera = api;
}

export function getEditorCamera() {
  return editorCamera ?? editorCameraRegistry.__pocEditorCamera ?? null;
}

export function isCameraControls(
  value: unknown,
): value is CameraControlsImpl {
  return (
    !!value &&
    typeof value === "object" &&
    "setLookAt" in value &&
    "getTarget" in value &&
    "getPosition" in value
  );
}

export function modelDiagonal(size: ModelSize | null) {
  if (!size) return 20;
  return Math.hypot(size.width, size.height, size.depth);
}

export function maxModelDimension(size: ModelSize) {
  return Math.max(size.width, size.height, size.depth, 1);
}

export function computeOverviewLookAt(
  size: ModelSize,
  aspect: number,
  fovDeg: number,
) {
  const maxDim = maxModelDimension(size);
  const target = new Vector3(0, size.height / 2, 0);
  const fov = (fovDeg * Math.PI) / 180;
  const fitHeightDistance = maxDim / (2 * Math.tan(fov / 2));
  const fitWidthDistance = fitHeightDistance / Math.max(aspect, 0.1);
  const distance = 1.45 * Math.max(fitHeightDistance, fitWidthDistance);
  const direction = new Vector3(1.15, 0.9, 1.25).normalize();
  const position = target.clone().addScaledVector(direction, distance);

  return {
    position,
    target,
    distance,
    near: Math.max(0.05, maxDim / 500),
    far: Math.max(250, maxDim * 25),
  };
}

export function clippingForModel(size: ModelSize) {
  const maxDim = maxModelDimension(size);
  return {
    near: Math.max(0.05, maxDim / 500),
    far: Math.max(250, maxDim * 25),
    minDistance: 0.08,
    maxDistance: maxDim * 12,
  };
}

export function previewClipping(size: ModelSize | null) {
  const diagonal = modelDiagonal(size);
  return {
    near: Math.max(0.02, diagonal / 10000),
    far: Math.max(1000, diagonal * 20),
  };
}

export function resolveViewpointLookAt(
  viewpoint: TourViewpoint,
  size: ModelSize | null,
) {
  const positionVector = new Vector3(
    viewpoint.position[0],
    viewpoint.position[1],
    viewpoint.position[2],
  );
  const targetCandidate = new Vector3(
    viewpoint.target[0],
    viewpoint.target[1],
    viewpoint.target[2],
  );
  const targetIsValid =
    Number.isFinite(targetCandidate.x) &&
    Number.isFinite(targetCandidate.y) &&
    Number.isFinite(targetCandidate.z) &&
    positionVector.distanceTo(targetCandidate) >= 0.1;

  if (targetIsValid) {
    return { position: positionVector, target: targetCandidate };
  }

  const quaternion = new Quaternion(
    viewpoint.quaternion[0],
    viewpoint.quaternion[1],
    viewpoint.quaternion[2],
    viewpoint.quaternion[3],
  );
  const forward = new Vector3(0, 0, -1)
    .applyQuaternion(quaternion)
    .normalize();
  const fallbackDistance = Math.max(modelDiagonal(size) * 0.1, 2);
  return {
    position: positionVector,
    target: positionVector.clone().add(forward.multiplyScalar(fallbackDistance)),
  };
}

export function captureFromControls(
  controls: CameraControlsImpl,
  camera: PerspectiveCamera,
): EditorCameraSnapshot {
  const position = new Vector3();
  const target = new Vector3();
  controls.getPosition(position);
  controls.getTarget(target);
  camera.quaternion.setFromRotationMatrix(camera.matrixWorld);

  return {
    position: position.toArray() as Vector3Tuple,
    quaternion: camera.quaternion.toArray() as QuaternionTuple,
    target: target.toArray() as Vector3Tuple,
    fov: camera.fov,
  };
}

export async function animateToViewpoint(
  controls: CameraControlsImpl,
  camera: PerspectiveCamera,
  viewpoint: TourViewpoint,
  size: ModelSize | null,
  shouldAbort?: () => boolean,
  duration = PREVIEW_DURATION_SECONDS,
) {
  const look = resolveViewpointLookAt(viewpoint, size);
  const clip = previewClipping(size);
  const previousSmoothTime = controls.smoothTime;

  camera.fov = viewpoint.fov;
  camera.near = clip.near;
  camera.far = clip.far;
  camera.updateProjectionMatrix();

  controls.enabled = true;
  controls.smoothTime = duration;
  try {
    await controls.setLookAt(
      look.position.x,
      look.position.y,
      look.position.z,
      look.target.x,
      look.target.y,
      look.target.z,
      true,
    );
    if (shouldAbort?.()) return look;
    await controls.setLookAt(
      look.position.x,
      look.position.y,
      look.position.z,
      look.target.x,
      look.target.y,
      look.target.z,
      false,
    );
  } finally {
    controls.smoothTime = previousSmoothTime;
  }

  return look;
}

export function syncControlsFromCamera(
  controls: CameraControlsImpl,
  camera: PerspectiveCamera,
) {
  const forward = new Vector3();
  camera.getWorldDirection(forward);
  const target = camera.position.clone().add(forward.multiplyScalar(4));
  void controls.setLookAt(
    camera.position.x,
    camera.position.y,
    camera.position.z,
    target.x,
    target.y,
    target.z,
    false,
  );
}

export function waitAnimationFrames(count = 2) {
  return new Promise<void>((resolve) => {
    const tick = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => tick(remaining - 1));
    };
    requestAnimationFrame(() => tick(count - 1));
  });
}

export async function restoreEditorPose(
  controls: CameraControlsImpl,
  camera: PerspectiveCamera,
  pose: EditorCameraSnapshot,
  size: ModelSize,
) {
  const clip = clippingForModel(size);
  const previousSmoothTime = controls.smoothTime;
  camera.fov = pose.fov;
  camera.near = clip.near;
  camera.far = clip.far;
  camera.updateProjectionMatrix();
  controls.enabled = true;
  controls.smoothTime = PREVIEW_DURATION_SECONDS;
  try {
    await controls.setLookAt(
      pose.position[0],
      pose.position[1],
      pose.position[2],
      pose.target[0],
      pose.target[1],
      pose.target[2],
      true,
    );
  } finally {
    controls.smoothTime = previousSmoothTime;
    controls.enabled = true;
  }
}

export async function frameOverviewWithControls(
  controls: CameraControlsImpl,
  camera: PerspectiveCamera,
  size: ModelSize,
  animate: boolean,
) {
  const look = computeOverviewLookAt(size, Math.max(camera.aspect, 0.1), camera.fov);
  camera.near = look.near;
  camera.far = look.far;
  camera.updateProjectionMatrix();
  const previousSmoothTime = controls.smoothTime;
  if (animate) {
    controls.smoothTime = PREVIEW_DURATION_SECONDS;
  }
  await controls.setLookAt(
    look.position.x,
    look.position.y,
    look.position.z,
    look.target.x,
    look.target.y,
    look.target.z,
    animate,
  );
  controls.smoothTime = previousSmoothTime;
}

export function translatedTarget(
  target: Vector3Tuple,
  from: Vector3Tuple,
  to: Vector3Tuple,
): Vector3Tuple {
  return [
    target[0] + (to[0] - from[0]),
    target[1] + (to[1] - from[1]),
    target[2] + (to[2] - from[2]),
  ];
}

export function targetFromPose(
  position: Vector3Tuple,
  quaternion: QuaternionTuple,
  distance: number,
): Vector3Tuple {
  const forward = new Vector3(0, 0, -1).applyQuaternion(
    new Quaternion().fromArray(quaternion),
  );
  return [
    position[0] + forward.x * distance,
    position[1] + forward.y * distance,
    position[2] + forward.z * distance,
  ];
}

export function viewpointDistance(viewpoint: TourViewpoint) {
  const dx = viewpoint.target[0] - viewpoint.position[0];
  const dy = viewpoint.target[1] - viewpoint.position[1];
  const dz = viewpoint.target[2] - viewpoint.position[2];
  const distance = Math.hypot(dx, dy, dz);
  return distance > 0.05 ? distance : 2;
}

export function markerWorldScale(size: ModelSize | null) {
  if (!size) return 0.45;
  return Math.min(2.2, Math.max(0.28, maxModelDimension(size) * 0.035));
}

export function modelBox(size: ModelSize) {
  const box = new Box3();
  box.min.set(-size.width / 2, 0, -size.depth / 2);
  box.max.set(size.width / 2, size.height, size.depth / 2);
  return box;
}
