"use client";

import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "three";
import { registerSceneCapture } from "@/lib/scene-capture";

export function SceneCaptureBridge() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    registerSceneCapture({ gl, scene, camera });
    return () => registerSceneCapture(null);
  }, [camera, gl, scene]);

  return null;
}
