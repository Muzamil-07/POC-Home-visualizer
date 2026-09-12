"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import { useTourStore } from "@/store/tour-store";
import type {
  TourViewpoint,
  Vector3Tuple,
  ViewpointPlacementDraft,
} from "@/types/tour";
import { getEditorCamera, markerWorldScale, type ModelSize } from "./editor-camera";
import { getGlbRoot } from "./glb-root";
import {
  createPlacementDraft,
  moveDraftTarget,
} from "./placement";
import { findVisiblePlacementIntersection } from "./section";
import { ViewpointFrustum } from "./ViewpointLayer";
import { ViewpointMarker } from "./ViewpointMarker";

type PlacementLayerProps = {
  modelSize: ModelSize | null;
};

const INVALID_SURFACE_MESSAGE = "Choose a flat, upward-facing surface";
const HOVER_MOVE_EPSILON = 0.02;
const RING_FACING = new Vector3(0, 0, 1);

const raycaster = new Raycaster();
const ndc = new Vector2();
const hoverPoint = new Vector3();
const hoverNormal = new Vector3(0, 1, 0);
const planeHit = new Vector3();
const unitY = new Vector3(0, 1, 0);

function resolvePlacementHit(
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

function sameHover(
  previous: Vector3Tuple | null,
  next: Vector3,
  previousValid: boolean,
  nextValid: boolean,
) {
  if (previousValid !== nextValid) return false;
  if (!previous) return false;
  const dx = previous[0] - next.x;
  const dy = previous[1] - next.y;
  const dz = previous[2] - next.z;
  return dx * dx + dy * dy + dz * dz < HOVER_MOVE_EPSILON * HOVER_MOVE_EPSILON;
}

export function PlacementLayer({ modelSize }: PlacementLayerProps) {
  const isPlacementMode = useTourStore((state) => state.isPlacementMode);
  const placementDraft = useTourStore((state) => state.placementDraft);
  const gl = useThree((state) => state.gl);
  const getThree = useThree((state) => state.get);
  const draggedRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });
  const draggingTargetRef = useRef(false);

  useEffect(() => {
    if (!isPlacementMode) return;
    const element = gl.domElement;

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      originRef.current = { x: event.clientX, y: event.clientY };
      draggedRef.current = false;
    }

    function onPointerMove(event: PointerEvent) {
      if (event.buttons === 0 || draggingTargetRef.current) return;
      const dx = event.clientX - originRef.current.x;
      const dy = event.clientY - originRef.current.y;
      if (dx * dx + dy * dy > 16) {
        draggedRef.current = true;
      }
    }

    function onPointerUp(event: PointerEvent) {
      if (event.button !== 0) return;
      if (draggingTargetRef.current) return;
      if (draggedRef.current) return;
      const store = useTourStore.getState();
      if (!store.isPlacementMode || store.placementDraft) return;

      const { camera } = getThree();
      pointerFromEvent(event, element, ndc);
      const found = resolvePlacementHit(
        camera as PerspectiveCamera,
        ndc,
        modelSize?.height ?? 1,
      );
      if (!found || !found.walkable) {
        store.showPlacementNotice(INVALID_SURFACE_MESSAGE);
        return;
      }

      store.setPlacementDraft(
        createPlacementDraft(
          found.intersection.point,
          camera,
          store.eyeHeight,
          store.editorFov,
          modelSize,
        ),
      );
      store.setPlacementHover(null, false);
    }

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
    };
  }, [getThree, gl, isPlacementMode, modelSize]);

  if (!isPlacementMode) return null;

  return (
    <group>
      {placementDraft ? (
        <DraftViewpoint
          draft={placementDraft}
          modelSize={modelSize}
          draggingTargetRef={draggingTargetRef}
        />
      ) : (
        <SurfaceHoverIndicator modelSize={modelSize} />
      )}
    </group>
  );
}

function SurfaceHoverIndicator({ modelSize }: { modelSize: ModelSize | null }) {
  const indicatorRef = useRef<Group>(null);
  const getThree = useThree((state) => state.get);
  const lastHoverRef = useRef<Vector3Tuple | null>(null);
  const lastValidRef = useRef(false);

  useFrame(() => {
    const store = useTourStore.getState();
    const indicator = indicatorRef.current;
    if (!indicator) return;
    if (
      !store.isPlacementMode ||
      store.placementDraft ||
      store.appMode !== "edit"
    ) {
      indicator.visible = false;
      if (store.hoveredSurfacePoint !== null) {
        store.setPlacementHover(null, false);
      }
      return;
    }

    const { camera, pointer } = getThree();
    ndc.copy(pointer);
    const found = resolvePlacementHit(
      camera as PerspectiveCamera,
      ndc,
      modelSize?.height ?? 1,
    );
    if (!found) {
      indicator.visible = false;
      if (store.hoveredSurfacePoint !== null) {
        store.setPlacementHover(null, false);
      }
      lastHoverRef.current = null;
      lastValidRef.current = false;
      return;
    }

    const valid = found.walkable;
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
        material.color.set(valid ? "#6f9e5e" : "#c45c4a");
      }
    });

    if (
      !sameHover(
        lastHoverRef.current,
        hoverPoint,
        lastValidRef.current,
        valid,
      )
    ) {
      lastHoverRef.current = [hoverPoint.x, hoverPoint.y, hoverPoint.z];
      lastValidRef.current = valid;
      store.setPlacementHover(lastHoverRef.current, valid);
    }
  });

  return (
    <group ref={indicatorRef} visible={false}>
      <mesh renderOrder={6} raycast={() => {}}>
        <ringGeometry args={[0.22, 0.34, 40]} />
        <meshBasicMaterial
          color="#6f9e5e"
          depthWrite={false}
          transparent
          opacity={0.95}
        />
      </mesh>
      <mesh renderOrder={5} raycast={() => {}}>
        <circleGeometry args={[0.22, 40]} />
        <meshBasicMaterial
          color="#6f9e5e"
          depthWrite={false}
          transparent
          opacity={0.22}
        />
      </mesh>
    </group>
  );
}

function DraftViewpoint({
  draft,
  modelSize,
  draggingTargetRef,
}: {
  draft: ViewpointPlacementDraft;
  modelSize: ModelSize | null;
  draggingTargetRef: React.MutableRefObject<boolean>;
}) {
  const [anchor, setAnchor] = useState<Group | null>(null);
  const scale = markerWorldScale(modelSize);

  const viewpoint = useMemo<TourViewpoint>(
    () => ({
      id: "__placement-draft__",
      name: "New viewpoint",
      description: "",
      position: draft.position,
      quaternion: draft.quaternion,
      target: draft.target,
      fov: draft.fov,
      order: -1,
      createdAt: "",
      updatedAt: "",
    }),
    [draft.fov, draft.position, draft.quaternion, draft.target],
  );

  return (
    <>
      <group
        ref={setAnchor}
        position={draft.position}
        quaternion={draft.quaternion}
      >
        <ViewpointMarker
          viewpoint={viewpoint}
          selected
          scale={scale}
          local
        />
      </group>
      {anchor ? (
        <ViewpointFrustum
          anchor={anchor}
          fov={draft.fov}
          modelSize={modelSize}
        />
      ) : null}
      <Line
        points={[draft.position, draft.target]}
        color="#4f7ec4"
        lineWidth={2}
        raycast={() => {}}
      />
      <DraftTargetHandle
        draft={draft}
        scale={scale}
        draggingTargetRef={draggingTargetRef}
      />
    </>
  );
}

function DraftTargetHandle({
  draft,
  scale,
  draggingTargetRef,
}: {
  draft: ViewpointPlacementDraft;
  scale: number;
  draggingTargetRef: React.MutableRefObject<boolean>;
}) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const plane = useMemo(() => new Plane(), []);
  const radius = Math.max(0.08, scale * 0.22);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      if (!draggingTargetRef.current) return;
      const draftNow = useTourStore.getState().placementDraft;
      if (!draftNow) return;
      pointerFromEvent(event, gl.domElement, ndc);
      raycaster.setFromCamera(ndc, camera);
      plane.set(unitY, -draftNow.position[1]);
      if (!raycaster.ray.intersectPlane(plane, planeHit)) return;
      useTourStore
        .getState()
        .setPlacementDraft(moveDraftTarget(draftNow, planeHit));
    }

    function onPointerUp() {
      if (!draggingTargetRef.current) return;
      draggingTargetRef.current = false;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [camera, draggingTargetRef, gl, plane]);

  return (
    <mesh
      position={draft.target}
      renderOrder={8}
      onPointerDown={(event) => {
        event.stopPropagation();
        draggingTargetRef.current = true;
      }}
    >
      <sphereGeometry args={[radius, 18, 18]} />
      <meshBasicMaterial color="#efece6" depthTest={false} />
    </mesh>
  );
}

export function PlacementCameraLock() {
  const isPlacementMode = useTourStore((state) => state.isPlacementMode);
  const appMode = useTourStore((state) => state.appMode);

  useLayoutEffect(() => {
    if (appMode !== "edit") return;
    if (isPlacementMode) {
      getEditorCamera()?.setEnabled(false);
      return;
    }
    getEditorCamera()?.setEnabled(true);
  }, [appMode, isPlacementMode]);

  return null;
}
