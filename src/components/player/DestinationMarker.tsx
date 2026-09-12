"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { FloorPickKind } from "@/types/exploration";
import { areHelpersHiddenForCapture } from "@/lib/capture-lock";

const colorForKind: Record<FloorPickKind, string> = {
  valid: "#7ed0c5",
  invalid: "#c45c4a",
  far: "#e0b15a",
  blocked: "#c45c4a",
  tight: "#c45c4a",
  stairs: "#e0b15a",
};

const colorCache: Record<FloorPickKind, Color> = {
  valid: new Color(colorForKind.valid),
  invalid: new Color(colorForKind.invalid),
  far: new Color(colorForKind.far),
  blocked: new Color(colorForKind.blocked),
  tight: new Color(colorForKind.tight),
  stairs: new Color(colorForKind.stairs),
};

const UP = new Vector3(0, 1, 0);

/**
 * Mutable view model driven imperatively by the controller. Updating this ref
 * during pointer movement avoids a full React rerender per mouse event while
 * keeping the marker perfectly in sync with the latest floor pick.
 */
export type MarkerView = {
  visible: boolean;
  point: [number, number, number];
  normal: [number, number, number];
  kind: FloorPickKind;
  /** true once a destination is committed (stops the hover pulse). */
  confirmed: boolean;
};

export function createMarkerView(): MarkerView {
  return {
    visible: false,
    point: [0, 0, 0],
    normal: [0, 1, 0],
    kind: "valid",
    confirmed: false,
  };
}

const _normal = new Vector3();
const _point = new Vector3();
const _quat = new Quaternion();

export function DestinationMarker({
  viewRef,
}: {
  viewRef: React.MutableRefObject<MarkerView>;
}) {
  const camera = useThree((state) => state.camera);
  const groupRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);
  const dotRef = useRef<Mesh>(null);
  const pulse = useRef(0);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const view = viewRef.current;
    if (!view.visible || areHelpersHiddenForCapture()) {
      if (group.visible) group.visible = false;
      return;
    }
    group.visible = true;

    _normal.set(view.normal[0], view.normal[1], view.normal[2]);
    if (_normal.lengthSq() < 1e-8) _normal.copy(UP);
    else _normal.normalize();

    // Lift slightly off the surface to avoid z-fighting with the floor.
    group.position.set(
      view.point[0] + _normal.x * 0.02,
      view.point[1] + _normal.y * 0.02,
      view.point[2] + _normal.z * 0.02,
    );
    _quat.setFromUnitVectors(UP, _normal);
    group.quaternion.copy(_quat);

    pulse.current += delta;
    _point.set(view.point[0], view.point[1], view.point[2]);
    const distance = camera.position.distanceTo(_point);
    const base = Math.max(0.16, Math.min(0.62, distance * 0.016));
    const scale = view.confirmed
      ? base
      : base * (1 + Math.sin(pulse.current * 3.4) * 0.09);
    group.scale.setScalar(scale);

    const color = colorCache[view.kind];
    const ringMat = ringRef.current?.material as MeshBasicMaterial | undefined;
    const dotMat = dotRef.current?.material as MeshBasicMaterial | undefined;
    if (ringMat) {
      ringMat.color.copy(color);
      ringMat.opacity = view.confirmed ? 0.95 : 0.7;
    }
    if (dotMat) {
      dotMat.color.copy(color);
      dotMat.opacity = 0.92;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh
        ref={ringRef}
        raycast={() => null}
        castShadow={false}
        receiveShadow={false}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.55, 0.8, 40]} />
        <meshBasicMaterial
          transparent
          opacity={0.7}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <mesh
        ref={dotRef}
        raycast={() => null}
        castShadow={false}
        receiveShadow={false}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.11, 20]} />
        <meshBasicMaterial
          transparent
          opacity={0.92}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}
