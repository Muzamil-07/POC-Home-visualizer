// @ts-nocheck — paused walkable-route editor
"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import { useTourStore } from "@/store/tour-store";
import { getGlbRoot } from "./glb-root";
import { findVisiblePlacementIntersection } from "./section";
import type { ModelSize } from "./editor-camera";

const INVALID_SURFACE_MESSAGE = "Choose a flat, upward-facing surface";
const raycaster = new Raycaster();
const ndc = new Vector2();
const hoverPoint = new Vector3();
const hoverNormal = new Vector3(0, 1, 0);
const RING_FACING = new Vector3(0, 0, 1);

function resolveFloorHit(
  camera: PerspectiveCamera,
  pointer: Vector2,
  modelHeight: number,
) {
  const root = getGlbRoot();
  if (!root) return null;
  root.updateWorldMatrix(true, true);
  raycaster.firstHitOnly = false;
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObject(root, true);
  const store = useTourStore.getState();
  return findVisiblePlacementIntersection({
    intersections,
    sectionEnabled:
      store.appMode === "edit" && store.section.enabled && Boolean(root),
    sectionHeight: store.section.height,
    modelHeight,
    rayDirection: raycaster.ray.direction,
  });
}

function pointerFromEvent(
  event: PointerEvent,
  element: HTMLCanvasElement,
  target: Vector2,
) {
  const rect = element.getBoundingClientRect();
  target.set(
    ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
    -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
  );
  return target;
}

export function RoutePlacementLayer({
  modelSize,
}: {
  modelSize: ModelSize | null;
}) {
  const adding = useTourStore((state) => state.routeEditMode === "add-node");
  const gl = useThree((state) => state.gl);
  const getThree = useThree((state) => state.get);
  const draggedRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!adding) return;
    const element = gl.domElement;

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      originRef.current = { x: event.clientX, y: event.clientY };
      draggedRef.current = false;
    }

    function onPointerMove(event: PointerEvent) {
      if (event.buttons === 0) return;
      const dx = event.clientX - originRef.current.x;
      const dy = event.clientY - originRef.current.y;
      if (dx * dx + dy * dy > 16) {
        draggedRef.current = true;
      }
    }

    function onPointerUp(event: PointerEvent) {
      if (event.button !== 0 || draggedRef.current) return;
      const store = useTourStore.getState();
      if (store.routeEditMode !== "add-node") return;
      const { camera } = getThree();
      pointerFromEvent(event, element, ndc);
      const found = resolveFloorHit(
        camera as PerspectiveCamera,
        ndc,
        modelSize?.height ?? 1,
      );
      if (!found || !found.walkable) {
        store.showPlacementNotice(INVALID_SURFACE_MESSAGE);
        return;
      }
      const point = found.intersection.point;
      store.addRouteNodeAt([point.x, point.y, point.z]);
    }

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
    };
  }, [adding, getThree, gl, modelSize]);

  if (!adding) return null;
  return <RouteFloorHover modelSize={modelSize} />;
}

function RouteFloorHover({ modelSize }: { modelSize: ModelSize | null }) {
  const indicatorRef = useRef<Group>(null);
  const getThree = useThree((state) => state.get);

  useFrame(() => {
    const store = useTourStore.getState();
    const indicator = indicatorRef.current;
    if (!indicator) return;
    if (store.routeEditMode !== "add-node") {
      indicator.visible = false;
      return;
    }
    const { camera, pointer } = getThree();
    const found = resolveFloorHit(
      camera as PerspectiveCamera,
      pointer,
      modelSize?.height ?? 1,
    );
    if (!found) {
      indicator.visible = false;
      return;
    }
    hoverPoint.copy(found.intersection.point);
    hoverNormal.copy(found.worldNormal);
    indicator.visible = true;
    indicator.position.copy(hoverPoint).addScaledVector(hoverNormal, 0.02);
    indicator.quaternion.setFromUnitVectors(RING_FACING, hoverNormal);
    const distance = camera.position.distanceTo(hoverPoint);
    const scale = Math.min(2.4, Math.max(0.16, distance * 0.016));
    indicator.scale.setScalar(scale);
    indicator.children.forEach((child) => {
      const mesh = child as Mesh;
      const material = mesh.material;
      if (material instanceof MeshBasicMaterial) {
        material.color.set(found.walkable ? "#3ecf8e" : "#c45c4a");
      }
    });
  });

  return (
    <group ref={indicatorRef} visible={false}>
      <mesh renderOrder={6} raycast={() => null}>
        <ringGeometry args={[0.16, 0.26, 36]} />
        <meshBasicMaterial
          color="#3ecf8e"
          depthWrite={false}
          transparent
          opacity={0.95}
        />
      </mesh>
    </group>
  );
}
