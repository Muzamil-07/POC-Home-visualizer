"use client";

import { Html } from "@react-three/drei";
import { DoubleSide } from "three";
import type { TourViewpoint } from "@/types/tour";
import { useTourStore } from "@/store/tour-store";
import { getEditorCamera } from "./editor-camera";

type ViewpointMarkerProps = {
  viewpoint: TourViewpoint;
  selected: boolean;
  scale: number;
  local?: boolean;
};

export function ViewpointMarker({
  viewpoint,
  selected,
  scale,
  local = false,
}: ViewpointMarkerProps) {
  const selectViewpoint = useTourStore((state) => state.selectViewpoint);
  const body = selected ? "#efece6" : "#c45c4a";
  const accent = selected ? "#c45c4a" : "#9aa0a6";

  return (
    <group
      position={local ? [0, 0, 0] : viewpoint.position}
      quaternion={local ? [0, 0, 0, 1] : viewpoint.quaternion}
      scale={scale}
    >
      <mesh
        renderOrder={2}
        onPointerDown={(event) => {
          if (useTourStore.getState().isPlacementMode) return;
          event.stopPropagation();
          getEditorCamera()?.setEnabled(false);
        }}
        onPointerUp={() => {
          if (useTourStore.getState().isPlacementMode) return;
          getEditorCamera()?.setEnabled(true);
        }}
        onPointerLeave={() => {
          if (useTourStore.getState().isPlacementMode) return;
          getEditorCamera()?.setEnabled(true);
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (useTourStore.getState().isPlacementMode) return;
          selectViewpoint(viewpoint.id);
        }}
      >
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      <mesh renderOrder={3} raycast={() => {}}>
        <boxGeometry args={[0.34, 0.22, 0.2]} />
        <meshBasicMaterial color={body} depthTest={false} />
      </mesh>
      <mesh position={[0, 0.16, 0]} renderOrder={3} raycast={() => {}}>
        <boxGeometry args={[0.12, 0.08, 0.08]} />
        <meshBasicMaterial color={accent} depthTest={false} />
      </mesh>
      <mesh
        position={[0, 0, -0.18]}
        rotation={[Math.PI / 2, 0, 0]}
        renderOrder={3}
        raycast={() => {}}
      >
        <cylinderGeometry args={[0.08, 0.11, 0.14, 16]} />
        <meshBasicMaterial color={accent} depthTest={false} />
      </mesh>
      <mesh
        position={[0, 0, -0.42]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={3}
        raycast={() => {}}
      >
        <coneGeometry args={[0.07, 0.28, 12]} />
        <meshBasicMaterial color="#4f7ec4" depthTest={false} />
      </mesh>

      <Html
        center
        sprite
        occlude={false}
        pointerEvents="none"
        distanceFactor={10}
        position={[0, 0.42, 0]}
        zIndexRange={[8, 0]}
      >
        <div
          className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] tracking-wide ${
            selected
              ? "border-[#efece6]/40 bg-[#efece6] text-[#16181c]"
              : "border-white/15 bg-[#16181c]/90 text-[#efece6]"
          }`}
        >
          {viewpoint.name}
        </div>
      </Html>
    </group>
  );
}
