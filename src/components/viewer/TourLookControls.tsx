"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Euler, Quaternion, Vector3, type PerspectiveCamera } from "three";
import type { CameraControlsImpl } from "@react-three/drei";
import { TOUR_PITCH_LIMIT } from "@/types/tour";
import {
  selectActiveTourViewpoint,
  useTourStore,
} from "@/store/tour-store";
import { isCameraControls, viewpointDistance } from "./editor-camera";

const SENSITIVITY = 0.0045;
const euler = new Euler(0, 0, 0, "YXZ");
const quaternion = new Quaternion();
const forward = new Vector3();

export function TourLookControls() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls);
  const viewpoint = useTourStore(selectActiveTourViewpoint);
  const appMode = useTourStore((state) => state.appMode);
  const isTourTransitioning = useTourStore((state) => state.isTourTransitioning);
  const isExitingTour = useTourStore((state) => state.isExitingTour);
  const enabled =
    appMode === "tour" && !isTourTransitioning && !isExitingTour;

  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const draggingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    camera.updateMatrixWorld();
    euler.setFromQuaternion(camera.quaternion, "YXZ");
    yawRef.current = euler.y;
    pitchRef.current = euler.x;
  }, [camera, viewpoint?.id]);

  useEffect(() => {
    if (!enabled || !viewpoint) return;
    const element = gl.domElement;
    const cameraControls = isCameraControls(controls) ? controls : null;
    const lookDistance = Math.max(3, viewpointDistance(viewpoint));
    const lockedPosition = viewpoint.position;

    function applyLook(cameraControls: CameraControlsImpl) {
      euler.set(pitchRef.current, yawRef.current, 0, "YXZ");
      quaternion.setFromEuler(euler);
      forward.set(0, 0, -1).applyQuaternion(quaternion);
      const [px, py, pz] = lockedPosition;
      void cameraControls.setLookAt(
        px,
        py,
        pz,
        px + forward.x * lookDistance,
        py + forward.y * lookDistance,
        pz + forward.z * lookDistance,
        false,
      );
    }

    function onPointerDown(event: PointerEvent) {
      if (event.target !== element) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      draggingRef.current = true;
      lastRef.current = { x: event.clientX, y: event.clientY };
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Some browsers reject capture on a released pointer.
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (!draggingRef.current || !cameraControls) return;
      const dx = event.clientX - lastRef.current.x;
      const dy = event.clientY - lastRef.current.y;
      lastRef.current = { x: event.clientX, y: event.clientY };
      yawRef.current -= dx * SENSITIVITY;
      pitchRef.current = Math.max(
        -TOUR_PITCH_LIMIT,
        Math.min(TOUR_PITCH_LIMIT, pitchRef.current - dy * SENSITIVITY),
      );
      applyLook(cameraControls);
    }

    function onPointerUp(event: PointerEvent) {
      draggingRef.current = false;
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    }

    element.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [camera, controls, enabled, gl, viewpoint]);

  return null;
}
