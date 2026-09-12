"use client";

import { useLayoutEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { CameraControls, type CameraControlsImpl } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import type { PublishedViewpoint } from "@/lib/tour-schema";
import { publishedViewpointAsTour } from "@/lib/published-viewpoint";
import {
  animateToViewpoint,
  clippingForModel,
  previewClipping,
  resolveViewpointLookAt,
  type ModelSize,
} from "@/components/viewer/editor-camera";

export type PlayerCameraHandle = {
  goTo: (viewpoint: PublishedViewpoint, animate: boolean) => Promise<void>;
};

type PublicCameraControlsProps = {
  viewpoints: PublishedViewpoint[];
  startId: string;
  modelSize: ModelSize | null;
  transitionDuration: number;
  onArrived: (id: string) => void;
  onTransitioning: (value: boolean) => void;
};

export const PublicCameraControls = forwardRef<
  PlayerCameraHandle,
  PublicCameraControlsProps
>(function PublicCameraControls(
  {
    viewpoints,
    startId,
    modelSize,
    transitionDuration,
    onArrived,
    onTransitioning,
  },
  ref,
) {
  const controlsRef = useRef<CameraControlsImpl>(null);
  const moveIdRef = useRef(0);
  const didStart = useRef(false);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const clip = modelSize ? clippingForModel(modelSize) : null;

  useImperativeHandle(ref, () => ({
    goTo: async (viewpoint, animate) => {
      const controls = controlsRef.current;
      if (!controls) return;
      const moveId = ++moveIdRef.current;
      onTransitioning(true);
      controls.enabled = true;
      try {
        if (animate) {
          await animateToViewpoint(
            controls,
            camera,
            publishedViewpointAsTour(viewpoint),
            modelSize,
            () => moveId !== moveIdRef.current,
            transitionDuration,
          );
        } else {
          const look = resolveViewpointLookAt(
            publishedViewpointAsTour(viewpoint),
            modelSize,
          );
          camera.fov = viewpoint.fov;
          camera.updateProjectionMatrix();
          await controls.setLookAt(
            look.position.x,
            look.position.y,
            look.position.z,
            look.target.x,
            look.target.y,
            look.target.z,
            false,
          );
        }
      } finally {
        if (moveId === moveIdRef.current) {
          controls.enabled = false;
          onArrived(viewpoint.id);
          onTransitioning(false);
        }
      }
    },
  }));

  useLayoutEffect(() => {
    if (didStart.current || !modelSize || !controlsRef.current) return;
    const start = viewpoints.find((item) => item.id === startId) ?? viewpoints[0];
    if (!start) return;
    didStart.current = true;
    const look = resolveViewpointLookAt(
      publishedViewpointAsTour(start),
      modelSize,
    );
    camera.fov = start.fov;
    const preview = previewClipping(modelSize);
    camera.near = preview.near;
    camera.far = preview.far;
    camera.updateProjectionMatrix();
    void controlsRef.current.setLookAt(
      look.position.x,
      look.position.y,
      look.position.z,
      look.target.x,
      look.target.y,
      look.target.z,
      false,
    );
    controlsRef.current.enabled = false;
    onArrived(start.id);
  }, [camera, modelSize, onArrived, startId, viewpoints]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={clip?.minDistance ?? 0.08}
      maxDistance={clip?.maxDistance ?? 80}
      minPolarAngle={0.02}
      maxPolarAngle={Math.PI - 0.02}
      smoothTime={transitionDuration}
      enabled={false}
    />
  );
});
