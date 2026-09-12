"use client";

import { useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { Fog } from "three";
import { DAY_LIGHTING } from "@/lib/lighting";
import { LightingEnvironment, LightingRig } from "./LightingEnvironment";
import { SiteGround } from "./SiteGround";
import type { GroundSettings } from "@/lib/ground";
import type { ModelSize } from "./editor-camera";

export const SHOW_EDITOR_GRID = false;

export function OutdoorScene({
  modelSize,
  ground,
  enableShadows,
  shadowExtent,
}: {
  modelSize: ModelSize | null;
  ground: GroundSettings | null;
  enableShadows: boolean;
  shadowExtent: number;
}) {
  return (
    <>
      <LightingEnvironment />
      <LightingRig enableShadows={enableShadows} shadowExtent={shadowExtent} />
      {modelSize && ground?.enabled ? (
        <>
          <SiteGround
            modelBounds={modelSize}
            siteGradeY={ground.siteGradeY}
            color={ground.color}
            sizeMultiplier={ground.sizeMultiplier}
          />
          <ContactShadows
            key={`${ground.siteGradeY}:${modelSize.width}`}
            position={[0, ground.siteGradeY + 0.02, 0]}
            opacity={0.16}
            scale={Math.max(modelSize.width, modelSize.depth) * 2.1}
            blur={3.2}
            far={Math.max(4.5, modelSize.height * 0.42)}
            frames={1}
            color="#2c3126"
          />
          <SceneAtmosphere
            modelSize={modelSize}
            siteGradeY={ground.siteGradeY}
          />
        </>
      ) : null}
    </>
  );
}

function SceneAtmosphere({
  modelSize,
  siteGradeY,
}: {
  modelSize: ModelSize;
  siteGradeY: number;
}) {
  const diagonal = Math.hypot(
    modelSize.width,
    modelSize.height,
    modelSize.depth,
  );
  const exteriorNear = diagonal * 2.4;
  const exteriorFar = diagonal * 8;
  const interiorNear = diagonal * 18;
  const interiorFar = diagonal * 60;

  useFrame((state) => {
    const fog =
      state.scene.fog instanceof Fog
        ? state.scene.fog
        : new Fog(DAY_LIGHTING.horizonColor, exteriorNear, exteriorFar);
    if (state.scene.fog !== fog) {
      state.scene.fog = fog;
    }
    fog.color.set(DAY_LIGHTING.horizonColor);
    const { camera } = state;
    const inside =
      Math.abs(camera.position.x) < modelSize.width * 0.42 &&
      Math.abs(camera.position.z) < modelSize.depth * 0.42 &&
      camera.position.y > siteGradeY + 0.4 &&
      camera.position.y < siteGradeY + modelSize.height * 0.78;
    fog.near = inside ? interiorNear : exteriorNear;
    fog.far = inside ? interiorFar : exteriorFar;
  });

  return (
    <fog
      attach="fog"
      args={[DAY_LIGHTING.horizonColor, exteriorNear, exteriorFar]}
    />
  );
}
