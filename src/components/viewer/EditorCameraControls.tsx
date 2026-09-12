"use client";

import { useLayoutEffect, useRef } from "react";
import { CameraControls, type CameraControlsImpl } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import { DEFAULT_FOV } from "@/types/tour";
import { selectCurrentViewpoints, useTourStore } from "@/store/tour-store";
import {
  animateToViewpoint,
  captureFromControls,
  clippingForModel,
  frameOverviewWithControls,
  registerEditorCamera,
  restoreEditorPose,
  syncControlsFromCamera,
  waitAnimationFrames,
  type ModelSize,
} from "./editor-camera";

type EditorCameraControlsProps = {
  modelSize: ModelSize | null;
};

function cancelControls(controls: CameraControlsImpl | null) {
  if (!controls) return;
  try {
    controls.cancel();
  } catch {
    // cancel() is a no-op if nothing is dragging.
  }
}

export function EditorCameraControls({ modelSize }: EditorCameraControlsProps) {
  const controlsRef = useRef<CameraControlsImpl>(null);
  const moveIdRef = useRef(0);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const clip = modelSize ? clippingForModel(modelSize) : null;
  const appMode = useTourStore((state) => state.appMode);
  const isTourTransitioning = useTourStore((state) => state.isTourTransitioning);
  const isExitingTour = useTourStore((state) => state.isExitingTour);
  const isPlacementMode = useTourStore((state) => state.isPlacementMode);
  const controlsEnabled = appMode === "edit" && !isPlacementMode;

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (
      appMode === "explore" ||
      (appMode === "tour" && !isTourTransitioning && !isExitingTour)
    ) {
      cancelControls(controls);
      controls.enabled = false;
      return;
    }
    if (appMode === "edit" && !isPlacementMode) {
      controls.enabled = true;
    }
  }, [appMode, isExitingTour, isPlacementMode, isTourTransitioning]);

  useLayoutEffect(() => {
    async function goToTourViewpoint(viewpointId: string) {
      const controls = controlsRef.current;
      if (!controls) return;

      const moveId = ++moveIdRef.current;
      const store = useTourStore.getState();
      const viewpoints = selectCurrentViewpoints(store);
      const viewpoint = viewpoints.find((item) => item.id === viewpointId);
      if (!viewpoint) {
        store.setTourTransitioning(false);
        return;
      }

      store.setTourTransitioning(true);
      store.setActiveTourViewpoint(viewpointId);
      store.setEditorFov(viewpoint.fov);

      cancelControls(controls);
      syncControlsFromCamera(controls, camera);
      controls.enabled = true;
      await waitAnimationFrames(1);
      if (moveId !== moveIdRef.current) return;

      try {
        await animateToViewpoint(controls, camera, viewpoint, modelSize, () => {
          return moveId !== moveIdRef.current;
        });
      } catch {
        // Keep going so look-around and later exits still work.
      }
      if (moveId !== moveIdRef.current) return;

      controls.enabled = false;
      useTourStore.getState().setTourTransitioning(false);
    }

    registerEditorCamera({
      capture: () => {
        const controls = controlsRef.current;
        if (!controls) return null;
        controls.update(0);
        camera.updateMatrixWorld();
        return captureFromControls(controls, camera);
      },
      enterTour: async (viewpointId) => {
        const store = useTourStore.getState();
        const viewpoints = selectCurrentViewpoints(store);
        const viewpoint = viewpoints.find((item) => item.id === viewpointId);
        if (!viewpoint) return;

        const controls = controlsRef.current;
        const snapshot =
          store.appMode === "edit" && controls
            ? (() => {
                controls.update(0);
                camera.updateMatrixWorld();
                return captureFromControls(controls, camera);
              })()
            : store.editorCameraSnapshot;

        store.enterTourMode(viewpointId, snapshot);
        await goToTourViewpoint(viewpointId);
      },
      enterExplore: async () => {
        const store = useTourStore.getState();
        const controls = controlsRef.current;
        if (store.appMode === "explore") return;

        const snapshot =
          store.appMode === "edit" && controls
            ? (() => {
                controls.update(0);
                camera.updateMatrixWorld();
                return captureFromControls(controls, camera);
              })()
            : store.editorCameraSnapshot;

        cancelControls(controls);
        if (controls) {
          controls.enabled = false;
        }
        store.enterExploreMode(snapshot);
      },
      goToTourViewpoint,
      exitTour: async () => {
        const store = useTourStore.getState();
        if (store.isExitingTour) return;

        moveIdRef.current += 1;
        store.beginExitTour();

        const controls = controlsRef.current;
        cancelControls(controls);
        if (controls) {
          controls.enabled = true;
        }

        try {
          const pose = store.editorCameraSnapshot;
          store.setEditorFov(pose?.fov ?? DEFAULT_FOV);

          if (!controls) return;

          if (pose) {
            if (modelSize) {
              await restoreEditorPose(controls, camera, pose, modelSize);
            } else {
              camera.fov = pose.fov;
              camera.updateProjectionMatrix();
              await controls.setLookAt(
                pose.position[0],
                pose.position[1],
                pose.position[2],
                pose.target[0],
                pose.target[1],
                pose.target[2],
                true,
              );
            }
          } else if (modelSize) {
            camera.fov = DEFAULT_FOV;
            camera.updateProjectionMatrix();
            await frameOverviewWithControls(controls, camera, modelSize, true);
          }
        } catch {
          if (modelSize && controls) {
            camera.fov = DEFAULT_FOV;
            camera.updateProjectionMatrix();
            controls.enabled = true;
            try {
              await frameOverviewWithControls(controls, camera, modelSize, false);
            } catch {
              // Controls stay enabled in finally even if this fallback fails.
            }
          }
        } finally {
          if (controlsRef.current) {
            controlsRef.current.enabled = true;
          }
          useTourStore.getState().finishExitTour();
        }
      },
      frameOverview: async (animate = true) => {
        const controls = controlsRef.current;
        if (!controls || !modelSize) return;
        const store = useTourStore.getState();
        if (store.appMode === "tour" || store.appMode === "explore" || store.isExitingTour) {
          moveIdRef.current += 1;
          cancelControls(controls);
          store.beginExitTour();
          controls.enabled = true;
          try {
            store.setEditorFov(DEFAULT_FOV);
            camera.fov = DEFAULT_FOV;
            camera.updateProjectionMatrix();
            await frameOverviewWithControls(controls, camera, modelSize, animate);
          } finally {
            controls.enabled = true;
            store.finishExitTour();
          }
          return;
        }
        store.setEditorFov(DEFAULT_FOV);
        camera.fov = DEFAULT_FOV;
        camera.updateProjectionMatrix();
        controls.enabled = true;
        await frameOverviewWithControls(controls, camera, modelSize, animate);
      },
      setEnabled: (enabled) => {
        const store = useTourStore.getState();
        if (
          (store.appMode === "tour" && !store.isTourTransitioning) ||
          store.appMode === "explore"
        ) {
          if (controlsRef.current) {
            controlsRef.current.enabled = false;
          }
          return;
        }
        if (controlsRef.current) {
          controlsRef.current.enabled = enabled;
        }
      },
      applyClipping: (size) => {
        const next = clippingForModel(size);
        if (controlsRef.current) {
          controlsRef.current.minDistance = next.minDistance;
          controlsRef.current.maxDistance = next.maxDistance;
        }
      },
    });

    return () => registerEditorCamera(null);
  }, [camera, modelSize]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault={appMode === "edit"}
      enabled={controlsEnabled}
      minDistance={clip?.minDistance ?? 0.08}
      maxDistance={clip?.maxDistance ?? 80}
      minPolarAngle={0.02}
      maxPolarAngle={Math.PI - 0.02}
      smoothTime={0.25}
      draggingSmoothTime={0.07}
      dollyToCursor
      infinityDolly={false}
    />
  );
}
