"use client";

import { useEffect, useMemo } from "react";
import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import {
  groundPlaneY,
  groundSize,
  type GroundSettings,
} from "@/lib/ground";
import type { ModelSize } from "./editor-camera";

function createGroundTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.fillStyle = "#7a7a7a";
  context.fillRect(0, 0, size, size);
  const image = context.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 18;
    const value = Math.max(0, Math.min(255, 122 + noise));
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
  }
  context.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(28, 28);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function SiteGround({
  modelBounds,
  siteGradeY,
  color,
  sizeMultiplier,
}: {
  modelBounds: ModelSize;
  siteGradeY: number;
  color: GroundSettings["color"];
  sizeMultiplier: GroundSettings["sizeMultiplier"];
}) {
  const texture = useMemo(() => createGroundTexture(), []);
  const size = groundSize(
    modelBounds.width,
    modelBounds.depth,
    sizeMultiplier,
  );
  const y = groundPlaneY(siteGradeY, modelBounds.height);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, y, 0]}
      receiveShadow
      renderOrder={-1}
      raycast={() => null}
      frustumCulled={false}
    >
      <planeGeometry args={[size, size, 1, 1]} />
      <meshStandardMaterial
        color={color}
        map={texture}
        roughness={0.95}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </mesh>
  );
}
