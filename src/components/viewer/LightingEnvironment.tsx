"use client";

import { Suspense, useLayoutEffect } from "react";
import { Environment } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { DAY_HDR_FILE, DAY_LIGHTING } from "@/lib/lighting";

function EnvironmentScene() {
  return (
    <Environment
      files={DAY_HDR_FILE}
      background
      environmentIntensity={DAY_LIGHTING.environmentIntensity}
      backgroundIntensity={DAY_LIGHTING.backgroundIntensity}
    />
  );
}

export function LightingRig({
  enableShadows,
  shadowExtent = 12,
}: {
  enableShadows: boolean;
  shadowExtent?: number;
}) {
  const gl = useThree((state) => state.gl);
  const extent = Math.max(8, shadowExtent);

  /* Three.js WebGLRenderer exposure is a mutable renderer field. */
  /* eslint-disable react-hooks/immutability */
  useLayoutEffect(() => {
    const previousExposure = gl.toneMappingExposure;
    const previousMapping = gl.toneMapping;
    const previousColorSpace = gl.outputColorSpace;
    gl.toneMapping = ACESFilmicToneMapping;
    gl.outputColorSpace = SRGBColorSpace;
    gl.toneMappingExposure = DAY_LIGHTING.exposure;
    return () => {
      gl.toneMappingExposure = previousExposure;
      gl.toneMapping = previousMapping;
      gl.outputColorSpace = previousColorSpace;
    };
  }, [gl]);
  /* eslint-enable react-hooks/immutability */

  return (
    <>
      <hemisphereLight
        args={[
          DAY_LIGHTING.hemisphereSky,
          DAY_LIGHTING.hemisphereGround,
          DAY_LIGHTING.hemisphereIntensity,
        ]}
      />
      <ambientLight intensity={DAY_LIGHTING.ambientIntensity} />
      <directionalLight
        color={DAY_LIGHTING.sunColor}
        intensity={DAY_LIGHTING.sunIntensity}
        castShadow={enableShadows}
        position={[16, 28, 10]}
        shadow-mapSize={[2048, 2048]}
        shadow-intensity={DAY_LIGHTING.shadowIntensity}
        shadow-bias={-0.00018}
        shadow-normalBias={0.035}
        shadow-radius={2.4}
        shadow-camera-near={0.5}
        shadow-camera-far={Math.max(40, extent * 4)}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
      />
    </>
  );
}

export function LightingEnvironment() {
  return (
    <Suspense fallback={null}>
      <EnvironmentScene />
    </Suspense>
  );
}
