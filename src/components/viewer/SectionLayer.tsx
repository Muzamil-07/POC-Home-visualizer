"use client";

import { useLayoutEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { DoubleSide } from "three";
import { useTourStore } from "@/store/tour-store";
import type { ModelSize } from "./editor-camera";
import { getGlbRoot } from "./glb-root";
import {
  applySectionClipping,
  restoreSectionClipping,
  setSectionPlaneHeight,
  sectionPlane,
} from "./section";

type SectionLayerProps = {
  modelSize: ModelSize | null;
};

export function SectionLayer({ modelSize }: SectionLayerProps) {
  const getThree = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const appMode = useTourStore((state) => state.appMode);
  const enabled = useTourStore((state) => state.section.enabled);
  const height = useTourStore((state) => state.section.height);
  const showPlane = useTourStore((state) => state.section.showPlane);
  const effective = appMode === "edit" && enabled && modelSize !== null;

  useLayoutEffect(() => {
    setSectionPlaneHeight(height);
    invalidate();
  }, [height, invalidate]);

  useLayoutEffect(() => {
    const { gl } = getThree();
    const root = getGlbRoot();
    gl.localClippingEnabled = effective;
    if (effective && root) {
      applySectionClipping(root, sectionPlane);
    } else {
      restoreSectionClipping(root);
    }
    invalidate();
    return () => {
      getThree().gl.localClippingEnabled = false;
      restoreSectionClipping(getGlbRoot());
    };
  }, [
    effective,
    getThree,
    invalidate,
    modelSize?.width,
    modelSize?.height,
    modelSize?.depth,
  ]);

  if (!effective || !showPlane || !modelSize) return null;

  return (
    <SectionPlaneHelper
      width={modelSize.width}
      depth={modelSize.depth}
      height={height}
    />
  );
}

function SectionPlaneHelper({
  width,
  depth,
  height,
}: {
  width: number;
  depth: number;
  height: number;
}) {
  const planeWidth = width * 1.05;
  const planeDepth = depth * 1.05;
  const points = useMemo(
    () =>
      [
        [-planeWidth / 2, 0, -planeDepth / 2],
        [planeWidth / 2, 0, -planeDepth / 2],
        [planeWidth / 2, 0, planeDepth / 2],
        [-planeWidth / 2, 0, planeDepth / 2],
        [-planeWidth / 2, 0, -planeDepth / 2],
      ] as [number, number, number][],
    [planeDepth, planeWidth],
  );

  return (
    <group position={[0, height + 0.004, 0]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={3}
        raycast={() => null}
      >
        <planeGeometry args={[planeWidth, planeDepth]} />
        <meshBasicMaterial
          color="#3d8f9e"
          transparent
          opacity={0.1}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <Line
        points={points}
        color="#6eb8c4"
        lineWidth={1}
        transparent
        opacity={0.5}
        raycast={() => null}
      />
    </group>
  );
}
