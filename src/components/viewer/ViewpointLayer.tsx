"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CameraHelper, Group, PerspectiveCamera, Vector3 } from "three";
import { TransformControls } from "@react-three/drei";
import {
  selectCurrentViewpoints,
  selectSelectedViewpoint,
  useTourStore,
} from "@/store/tour-store";
import type { QuaternionTuple, TourViewpoint, Vector3Tuple } from "@/types/tour";
import {
  getEditorCamera,
  markerWorldScale,
  targetFromPose,
  translatedTarget,
  viewpointDistance,
  type ModelSize,
} from "./editor-camera";
import { ViewpointMarker } from "./ViewpointMarker";

type ViewpointLayerProps = {
  modelSize: ModelSize | null;
};

const frustumScale = new Vector3();

export function ViewpointAuthoringLayer({ modelSize }: ViewpointLayerProps) {
  const viewpoints = useTourStore(selectCurrentViewpoints);
  const selectedId = useTourStore((state) => state.selectedId);
  const scale = markerWorldScale(modelSize);

  return (
    <group>
      {viewpoints.map((viewpoint) => (
        <ViewpointNode
          key={viewpoint.id}
          viewpoint={viewpoint}
          selected={viewpoint.id === selectedId}
          scale={scale}
          modelSize={modelSize}
        />
      ))}
    </group>
  );
}

export function ViewpointLayer(props: ViewpointLayerProps) {
  return <ViewpointAuthoringLayer {...props} />;
}

function ViewpointNode({
  viewpoint,
  selected,
  scale,
  modelSize,
}: {
  viewpoint: TourViewpoint;
  selected: boolean;
  scale: number;
  modelSize: ModelSize | null;
}) {
  if (!selected) {
    return (
      <ViewpointMarker
        viewpoint={viewpoint}
        selected={false}
        scale={scale}
      />
    );
  }

  return (
    <SelectedViewpoint
      viewpoint={viewpoint}
      scale={scale}
      modelSize={modelSize}
    />
  );
}

function SelectedViewpoint({
  viewpoint,
  scale,
  modelSize,
}: {
  viewpoint: TourViewpoint;
  scale: number;
  modelSize: ModelSize | null;
}) {
  const [anchor, setAnchor] = useState<Group | null>(null);
  const draggingRef = useRef(false);
  const transformMode = useTourStore((state) => state.transformMode);
  const isPlacementMode = useTourStore((state) => state.isPlacementMode);
  const updateViewpoint = useTourStore((state) => state.updateViewpoint);

  useLayoutEffect(() => {
    if (!anchor || draggingRef.current) return;
    anchor.position.fromArray(viewpoint.position);
    anchor.quaternion.fromArray(viewpoint.quaternion);
  }, [anchor, viewpoint.position, viewpoint.quaternion]);

  function commitTransform() {
    if (!anchor || useTourStore.getState().appMode !== "edit") return;
    const current = selectSelectedViewpoint(useTourStore.getState());
    if (!current) return;

    const position = anchor.position.toArray() as Vector3Tuple;
    const quaternion = anchor.quaternion.toArray() as QuaternionTuple;

    if (transformMode === "translate") {
      updateViewpoint(current.id, {
        position,
        target: translatedTarget(current.target, current.position, position),
      });
      return;
    }

    updateViewpoint(current.id, {
      quaternion,
      target: targetFromPose(position, quaternion, viewpointDistance(current)),
    });
  }

  return (
    <>
      <group ref={setAnchor}>
        <ViewpointMarker
          viewpoint={viewpoint}
          selected
          scale={scale}
          local
        />
      </group>
      {anchor ? (
        <>
          <ViewpointFrustum
            anchor={anchor}
            fov={viewpoint.fov}
            modelSize={modelSize}
          />
          {isPlacementMode ? null : (
            <TransformControls
              object={anchor}
              mode={transformMode}
              space={transformMode === "translate" ? "world" : "local"}
              size={0.85}
              onMouseDown={() => {
                draggingRef.current = true;
                getEditorCamera()?.setEnabled(false);
              }}
              onMouseUp={() => {
                draggingRef.current = false;
                getEditorCamera()?.setEnabled(true);
              }}
              onObjectChange={commitTransform}
            />
          )}
        </>
      ) : null}
    </>
  );
}

function syncFrustumHelper(
  helper: CameraHelper,
  anchor: Group,
  fov: number,
  aspect: number,
  far: number,
) {
  const camera = helper.camera as PerspectiveCamera;
  camera.fov = fov;
  camera.aspect = aspect;
  camera.near = 0.1;
  camera.far = far;
  camera.updateProjectionMatrix();
  anchor.updateWorldMatrix(true, false);
  anchor.matrixWorld.decompose(
    camera.position,
    camera.quaternion,
    frustumScale,
  );
  camera.updateMatrixWorld();
  helper.update();
}

export function ViewpointFrustum({
  anchor,
  fov,
  modelSize,
}: {
  anchor: Group;
  fov: number;
  modelSize: ModelSize | null;
}) {
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const far = Math.min(
    8,
    Math.max(
      2.4,
      modelSize
        ? Math.max(modelSize.width, modelSize.height, modelSize.depth) * 0.08
        : 3.2,
    ),
  );
  const helper = useMemo(() => {
    const helperCamera = new PerspectiveCamera(46, 1, 0.1, 3.2);
    return new CameraHelper(helperCamera);
  }, []);

  useLayoutEffect(() => {
    scene.add(helper);
    return () => {
      scene.remove(helper);
      helper.dispose();
    };
  }, [helper, scene]);

  useFrame(() => {
    syncFrustumHelper(
      helper,
      anchor,
      fov,
      size.width / Math.max(size.height, 1),
      far,
    );
  });

  return null;
}
