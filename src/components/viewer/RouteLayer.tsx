// @ts-nocheck — paused walkable-route editor
"use client";

import { useEffect, useMemo, useRef } from "react";
import { Html, Line, TransformControls } from "@react-three/drei";
import {
  ConeGeometry,
  Group,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import {
  selectCurrentRoutes,
  selectCurrentViewpoints,
  useTourStore,
} from "@/store/tour-store";
import { ROUTE_EYE_HEIGHT, type WalkableRoute } from "@/types/route";
import type { TourViewpoint } from "@/types/tour";
import { TOUR_MOTION_DEBUG } from "@/types/tour-motion";
import { compileWalkablePath } from "@/lib/compile-walkable-path";
import { nodeCameraPosition, routeCameraPolyline } from "@/lib/walkable-route";
import type { ModelSize } from "./editor-camera";
import { getEditorCamera } from "./editor-camera";
import { snapWorldPointToFloor, tupleFromVector } from "@/lib/route-floor";

const arrowGeometry = new ConeGeometry(0.06, 0.16, 8);
const arrowMaterialValid = new MeshBasicMaterial({
  color: "#3ecf8e",
  depthTest: false,
  toneMapped: false,
});
const arrowMaterialInvalid = new MeshBasicMaterial({
  color: "#e25c5c",
  depthTest: false,
  toneMapped: false,
});
const arrowMaterialSelected = new MeshBasicMaterial({
  color: "#e8b84a",
  depthTest: false,
  toneMapped: false,
});
const arrowMaterialMuted = new MeshBasicMaterial({
  color: "#6d7c8d",
  depthTest: false,
  toneMapped: false,
});

function routeColor(route: WalkableRoute, selected: boolean) {
  if (selected) return "#e8b84a";
  if (!route.valid) return "#e25c5c";
  return "#5f8f99";
}

function arrowMaterial(route: WalkableRoute, selected: boolean) {
  if (selected) return arrowMaterialSelected;
  if (!route.valid) return arrowMaterialInvalid;
  return route.valid ? arrowMaterialValid : arrowMaterialMuted;
}

export function RouteLayer({
  modelHeight,
  modelSize,
}: {
  modelHeight: number;
  modelSize?: ModelSize | null;
}) {
  const routes = useTourStore(selectCurrentRoutes);
  const viewpoints = useTourStore(selectCurrentViewpoints);
  const selectedRouteId = useTourStore((state) => state.selectedRouteId);
  const appMode = useTourStore((state) => state.appMode);

  if (appMode !== "edit" || routes.length === 0) return null;

  return (
    <group>
      {routes.map((route) => {
        const from = viewpoints.find((item) => item.id === route.fromViewpointId);
        const to = viewpoints.find((item) => item.id === route.toViewpointId);
        if (!from || !to) return null;
        return (
          <RouteWire
            key={route.id}
            route={route}
            from={from}
            to={to}
            selected={route.id === selectedRouteId}
            modelHeight={modelHeight}
            modelSize={modelSize}
          />
        );
      })}
    </group>
  );
}

function RouteWire({
  route,
  from,
  to,
  selected,
  modelHeight,
  modelSize,
}: {
  route: WalkableRoute;
  from: TourViewpoint;
  to: TourViewpoint;
  selected: boolean;
  modelHeight: number;
  modelSize?: ModelSize | null;
}) {
  const compiled = useMemo(
    () =>
      compileWalkablePath({
        route,
        sourceViewpoint: from,
        destinationViewpoint: to,
        direction: "forward",
        modelSize,
      }),
    [route, from, to, modelSize],
  );

  const smoothPoints = useMemo(() => {
    if (!compiled) return routeCameraPolyline(route, from, to);
    return compiled.samples.map(
      (point) => [point.x, point.y, point.z] as [number, number, number],
    );
  }, [compiled, route, from, to]);

  const controlPoints = useMemo(
    () => routeCameraPolyline(route, from, to),
    [route, from, to],
  );

  const arrows = useMemo(() => {
    const items: Array<{ position: Vector3; quaternion: Quaternion }> = [];
    if (!compiled) return items;
    const step = 1.2;
    const scratch = new Vector3();
    const ahead = new Vector3();
    for (let distance = step * 0.5; distance < compiled.totalLength; distance += step) {
      const index = compiled.cumulativeLengths.findIndex((length) => length >= distance);
      const point = compiled.samples[Math.max(0, index)] ?? compiled.samples[0]!;
      scratch.copy(point);
      const nextIndex = Math.min(compiled.samples.length - 1, Math.max(0, index) + 2);
      ahead.copy(compiled.samples[nextIndex]!);
      const direction = ahead.clone().sub(scratch);
      if (direction.lengthSq() < 1e-5) continue;
      items.push({
        position: scratch.clone(),
        quaternion: new Quaternion().setFromUnitVectors(
          new Vector3(0, 1, 0),
          direction.normalize(),
        ),
      });
    }
    return items;
  }, [compiled]);

  const color = routeColor(route, selected);
  const material = arrowMaterial(route, selected);

  return (
    <group>
      {smoothPoints.length > 1 ? (
        <Line
          points={smoothPoints}
          color={color}
          lineWidth={selected ? 2.6 : 1.7}
          depthTest={false}
          toneMapped={false}
          raycast={() => null}
        />
      ) : null}
      {selected && controlPoints.length > 1 ? (
        <Line
          points={controlPoints}
          color="#9aa4b0"
          lineWidth={1}
          dashed
          dashSize={0.12}
          gapSize={0.1}
          depthTest={false}
          toneMapped={false}
          raycast={() => null}
        />
      ) : null}
      {arrows.map((arrow, index) => (
        <mesh
          key={`${route.id}-arrow-${index}`}
          geometry={arrowGeometry}
          material={material}
          position={arrow.position}
          quaternion={arrow.quaternion}
          raycast={() => null}
        />
      ))}
      {selected ? (
        <>
          <Html position={from.position} center sprite occlude={false}>
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] tracking-wide text-[#efece6]">
              Start
            </span>
          </Html>
          <Html position={to.position} center sprite occlude={false}>
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] tracking-wide text-[#efece6]">
              Destination
            </span>
          </Html>
        </>
      ) : null}
      {selected && TOUR_MOTION_DEBUG && compiled
        ? compiled.cornerMarks.map((mark, index) => (
            <group key={`${route.id}-corner-${index}`}>
              <mesh position={mark.entry} raycast={() => null}>
                <sphereGeometry args={[0.06, 8, 8]} />
                <meshBasicMaterial color="#7ec8ff" depthTest={false} toneMapped={false} />
              </mesh>
              <mesh position={mark.exit} raycast={() => null}>
                <sphereGeometry args={[0.06, 8, 8]} />
                <meshBasicMaterial color="#c9a0ff" depthTest={false} toneMapped={false} />
              </mesh>
            </group>
          ))
        : null}
      {selected && TOUR_MOTION_DEBUG && compiled
        ? compiled.turns.map((turn, index) => {
            const sample =
              compiled.samples.find((_, i) =>
                Math.abs((compiled.cumulativeLengths[i] ?? 0) - turn.pathDistance) < 0.12,
              ) ?? compiled.samples[0]!;
            const left = turn.signedAngle > 0;
            return (
              <Html key={`${route.id}-turn-${index}`} position={sample} center sprite occlude={false}>
                <span className="rounded bg-black/70 px-1 py-0.5 text-[9px] text-[#f0d78c]">
                  {left ? "L" : "R"} {Math.round((turn.angle * 180) / Math.PI)}°
                </span>
              </Html>
            );
          })
        : null}
      {route.validationIssues.map((issue, index) => (
        <mesh
          key={`${route.id}-issue-${index}`}
          position={issue.position}
          raycast={() => null}
        >
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshBasicMaterial color="#e25c5c" depthTest={false} toneMapped={false} />
        </mesh>
      ))}
      {selected
        ? route.nodes.map((node) => (
            <RouteNodeHandle
              key={node.id}
              routeId={route.id}
              nodeId={node.id}
              position={nodeCameraPosition(node)}
              floorY={node.floorPosition[1]}
              modelHeight={modelHeight}
            />
          ))
        : null}
    </group>
  );
}

function RouteNodeHandle({
  routeId,
  nodeId,
  position,
  floorY,
  modelHeight,
}: {
  routeId: string;
  nodeId: string;
  position: [number, number, number];
  floorY: number;
  modelHeight: number;
}) {
  const selected = useTourStore((state) => state.selectedRouteNodeId === nodeId);
  const groupRef = useRef<Group>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(position[0], position[1], position[2]);
  }, [position]);

  return (
    <group>
      <mesh
        position={position}
        onClick={(event) => {
          event.stopPropagation();
          useTourStore.getState().selectRouteNode(nodeId);
        }}
      >
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshBasicMaterial
          color={selected ? "#f2d36b" : "#7ec8c4"}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      {selected ? (
        <group ref={groupRef} position={position}>
          <TransformControls
            mode="translate"
            size={0.65}
            onMouseDown={() => {
              dragging.current = true;
              getEditorCamera()?.setEnabled(false);
            }}
            onMouseUp={() => {
              dragging.current = false;
              getEditorCamera()?.setEnabled(true);
              const group = groupRef.current;
              if (!group) return;
              const snapped = snapWorldPointToFloor(group.position, modelHeight);
              const floor = snapped
                ? tupleFromVector(snapped)
                : ([
                    group.position.x,
                    floorY + (group.position.y - position[1]),
                    group.position.z,
                  ] as [number, number, number]);
              useTourStore.getState().updateRouteNode(routeId, nodeId, {
                floorPosition: floor,
                eyeHeight: ROUTE_EYE_HEIGHT,
              });
            }}
            onObjectChange={() => {
              getEditorCamera()?.setEnabled(false);
            }}
          />
        </group>
      ) : null}
    </group>
  );
}
