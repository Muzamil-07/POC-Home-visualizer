// @ts-nocheck — paused walkable-route editor
"use client";

import {
  selectCurrentRoutes,
  selectCurrentViewpoints,
  selectSelectedRoute,
  useTourStore,
} from "@/store/tour-store";
import {
  DEFAULT_WALKING_SPEED,
  DEFAULT_YAW_SPEED_DEG,
  MAX_LOOKAHEAD,
  MAX_WALKING_SPEED,
  MAX_YAW_SPEED_DEG,
  MIN_LOOKAHEAD,
  MIN_WALKING_SPEED,
  MIN_YAW_SPEED_DEG,
} from "@/types/route";
import {
  DEFAULT_TURN_RADIUS,
  MAX_TURN_RADIUS,
  MIN_TURN_RADIUS,
} from "@/types/tour-motion";
import { compileWalkablePath } from "@/lib/compile-walkable-path";
import { validateWalkableRoute } from "@/lib/route-validation";
import { getGlbRoot } from "./glb-root";
import {
  estimateWalkDuration,
  polylineLength,
  routeCameraPolyline,
} from "@/lib/walkable-route";
import { snapWorldPointToFloor, tupleFromVector } from "@/lib/route-floor";
import { Vector3 } from "three";
import { fieldClassName, iconButtonClass, toolbarToggleClass } from "./chrome";
import { testWalkableRoute } from "./tour-actions";

export function RoutePanel({ modelHeight }: { modelHeight?: number }) {
  const routes = useTourStore(selectCurrentRoutes);
  const viewpoints = useTourStore(selectCurrentViewpoints);
  const selected = useTourStore(selectSelectedRoute);
  const selectedNodeId = useTourStore((state) => state.selectedRouteNodeId);
  const adding = useTourStore((state) => state.routeEditMode === "add-node");
  const nameById = new Map(viewpoints.map((item) => [item.id, item.name]));

  if (viewpoints.length < 2) return null;

  return (
    <div className="flex flex-col gap-2 text-[12px]">
      {routes.length === 0 ? (
        <p className="text-[11px] leading-4 text-[#9aa0a6]">
          Select a viewpoint, click Connect Path, then choose a destination.
        </p>
      ) : (
        <ul className="flex max-h-36 flex-col gap-1 overflow-y-auto">
          {routes.map((route) => {
            const active = selected?.id === route.id;
            return (
              <li key={route.id}>
                <button
                  type="button"
                  onClick={() => useTourStore.getState().selectRoute(route.id)}
                  className={`w-full rounded px-2 py-1.5 text-left ${
                    active ? "bg-white/10 text-[#efece6]" : "text-[#c8c4bc] hover:bg-white/5"
                  }`}
                >
                  <span className="block truncate">
                    {nameById.get(route.fromViewpointId) ?? "Source"} →{" "}
                    {nameById.get(route.toViewpointId) ?? "Destination"}
                  </span>
                  <span className="font-mono text-[10px] text-[#9aa0a6]">
                    {route.valid ? "Valid" : "Invalid"} · {route.nodes.length} nodes
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected ? (
        <SelectedRouteDetails
          routeId={selected.id}
          selectedNodeId={selectedNodeId}
          adding={adding}
          modelHeight={modelHeight}
        />
      ) : null}
    </div>
  );
}

function SelectedRouteDetails({
  routeId,
  selectedNodeId,
  adding,
  modelHeight,
}: {
  routeId: string;
  selectedNodeId: string | null;
  adding: boolean;
  modelHeight?: number;
}) {
  const route = useTourStore((state) =>
    selectCurrentRoutes(state).find((item) => item.id === routeId),
  );
  const viewpoints = useTourStore(selectCurrentViewpoints);
  if (!route) return null;
  const from = viewpoints.find((item) => item.id === route.fromViewpointId);
  const to = viewpoints.find((item) => item.id === route.toViewpointId);
  if (!from || !to) return null;
  const compiled = compileWalkablePath({
    route,
    sourceViewpoint: from,
    destinationViewpoint: to,
    direction: "forward",
  });
  const length = compiled?.totalLength ?? polylineLength(routeCameraPolyline(route, from, to));
  const duration = estimateWalkDuration(length, route.walkingSpeed);
  const node = route.nodes.find((item) => item.id === selectedNodeId);

  return (
    <div className="flex flex-col gap-2 border-t border-white/8 pt-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-[#9aa0a6]">
        <dt>Source</dt>
        <dd className="truncate text-right text-[#efece6]">{from.name}</dd>
        <dt>Destination</dt>
        <dd className="truncate text-right text-[#efece6]">{to.name}</dd>
        <dt>Nodes</dt>
        <dd className="text-right font-mono text-[#efece6]">{route.nodes.length}</dd>
        <dt>Distance</dt>
        <dd className="text-right font-mono text-[#efece6]">{length.toFixed(1)} m</dd>
        <dt>Walk time</dt>
        <dd className="text-right font-mono text-[#efece6]">{duration.toFixed(1)} s</dd>
        <dt>Status</dt>
        <dd className="text-right text-[#efece6]">
          {route.valid ? "Valid" : "Invalid"}
        </dd>
      </dl>

      <label className="flex flex-col gap-1 text-[11px] text-[#9aa0a6]">
        Walking speed
        <input
          type="range"
          min={MIN_WALKING_SPEED}
          max={MAX_WALKING_SPEED}
          step={0.1}
          value={route.walkingSpeed}
          onChange={(event) =>
            useTourStore.getState().updateRoute(route.id, {
              walkingSpeed: Number(event.target.value),
            })
          }
        />
        <span className="font-mono text-[#efece6]">
          {(route.walkingSpeed || DEFAULT_WALKING_SPEED).toFixed(1)} m/s
        </span>
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-[#9aa0a6]">
        Turn radius
        <input
          type="range"
          min={MIN_TURN_RADIUS}
          max={MAX_TURN_RADIUS}
          step={0.05}
          value={route.turnRadius || DEFAULT_TURN_RADIUS}
          onChange={(event) =>
            useTourStore.getState().updateRoute(route.id, {
              turnRadius: Number(event.target.value),
            })
          }
        />
        <span className="font-mono text-[#efece6]">
          {(route.turnRadius || DEFAULT_TURN_RADIUS).toFixed(2)} m
        </span>
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-[#9aa0a6]">
        Look-ahead
        <input
          type="range"
          min={0}
          max={MAX_LOOKAHEAD}
          step={0.05}
          value={route.lookAheadDistance || 0}
          onChange={(event) =>
            useTourStore.getState().updateRoute(route.id, {
              lookAheadDistance: Number(event.target.value),
            })
          }
        />
        <span className="font-mono text-[#efece6]">
          {route.lookAheadDistance
            ? `${route.lookAheadDistance.toFixed(2)} m`
            : `Auto (${MIN_LOOKAHEAD.toFixed(1)}–${MAX_LOOKAHEAD.toFixed(1)} m)`}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-[#9aa0a6]">
        Maximum rotation
        <input
          type="range"
          min={MIN_YAW_SPEED_DEG}
          max={MAX_YAW_SPEED_DEG}
          step={1}
          value={route.maxYawSpeedDeg || DEFAULT_YAW_SPEED_DEG}
          onChange={(event) =>
            useTourStore.getState().updateRoute(route.id, {
              maxYawSpeedDeg: Number(event.target.value),
            })
          }
        />
        <span className="font-mono text-[#efece6]">
          {Math.round(route.maxYawSpeedDeg || DEFAULT_YAW_SPEED_DEG)} °/s
        </span>
      </label>

      <label className="flex items-center justify-between text-[11px] text-[#c8c4bc]">
        Bidirectional
        <input
          type="checkbox"
          checked={route.bidirectional}
          onChange={(event) =>
            useTourStore.getState().updateRoute(route.id, {
              bidirectional: event.target.checked,
            })
          }
        />
      </label>

      {route.validationIssues.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[11px] text-[#e8a4a4]">
          {route.validationIssues.slice(0, 4).map((issue, index) => (
            <li key={`${issue.type}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      {node ? (
        <div className="rounded border border-white/8 bg-black/20 p-2">
          <p className="mb-1 text-[11px] text-[#9aa0a6]">Selected point</p>
          <div className="grid grid-cols-3 gap-1">
            {(["x", "y", "z"] as const).map((axis, index) => (
              <input
                key={axis}
                className={fieldClassName()}
                value={node.floorPosition[index]!.toFixed(3)}
                onChange={(event) => {
                  const next = [...node.floorPosition] as [number, number, number];
                  next[index] = Number(event.target.value);
                  if (!Number.isFinite(next[index])) return;
                  useTourStore.getState().updateRouteNode(route.id, node.id, {
                    floorPosition: next,
                  });
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          aria-pressed={adding}
          onClick={() =>
            useTourStore.getState().setAddingPathPoint(!adding)
          }
          className={toolbarToggleClass(adding)}
        >
          Add path point
        </button>
        <button
          type="button"
          disabled={!selectedNodeId}
          onClick={() => {
            if (selectedNodeId) {
              useTourStore.getState().deleteRouteNode(route.id, selectedNodeId);
            }
          }}
          className={`${toolbarToggleClass(false)} disabled:opacity-35`}
        >
          Delete selected point
        </button>
        <button
          type="button"
          disabled={!selectedNodeId}
          onClick={() => {
            if (selectedNodeId) {
              useTourStore.getState().duplicateRouteNode(route.id, selectedNodeId);
            }
          }}
          className={`${toolbarToggleClass(false)} disabled:opacity-35`}
        >
          Duplicate point
        </button>
        <button
          type="button"
          disabled={!selectedNodeId || !modelHeight}
          onClick={() => {
            if (!selectedNodeId || !node || !modelHeight) return;
            const snapped = snapWorldPointToFloor(
              new Vector3(...node.floorPosition),
              modelHeight,
            );
            if (!snapped) return;
            useTourStore.getState().updateRouteNode(route.id, selectedNodeId, {
              floorPosition: tupleFromVector(snapped),
            });
          }}
          className={`${toolbarToggleClass(false)} disabled:opacity-35`}
        >
          Snap to floor
        </button>
        <button
          type="button"
          disabled={!selectedNodeId}
          onClick={() => {
            if (selectedNodeId) {
              useTourStore
                .getState()
                .insertRouteNodeRelative(route.id, selectedNodeId, "before");
            }
          }}
          className={`${toolbarToggleClass(false)} disabled:opacity-35`}
        >
          Add before
        </button>
        <button
          type="button"
          disabled={!selectedNodeId}
          onClick={() => {
            if (selectedNodeId) {
              useTourStore
                .getState()
                .insertRouteNodeRelative(route.id, selectedNodeId, "after");
            }
          }}
          className={`${toolbarToggleClass(false)} disabled:opacity-35`}
        >
          Add after
        </button>
        <button
          type="button"
          disabled={!selectedNodeId}
          onClick={() => {
            if (selectedNodeId) {
              useTourStore.getState().reorderRouteNode(route.id, selectedNodeId, "up");
            }
          }}
          className={`${toolbarToggleClass(false)} disabled:opacity-35`}
        >
          Move point earlier
        </button>
        <button
          type="button"
          disabled={!selectedNodeId}
          onClick={() => {
            if (selectedNodeId) {
              useTourStore
                .getState()
                .reorderRouteNode(route.id, selectedNodeId, "down");
            }
          }}
          className={`${toolbarToggleClass(false)} disabled:opacity-35`}
        >
          Move point later
        </button>
        <button
          type="button"
          onClick={() => useTourStore.getState().reverseRoute(route.id)}
          className={toolbarToggleClass(false)}
        >
          Reverse route
        </button>
        <button
          type="button"
          onClick={() => void testWalkableRoute(route.id, "forward")}
          className={toolbarToggleClass(false)}
        >
          Test Forward
        </button>
        <button
          type="button"
          onClick={() => void testWalkableRoute(route.id, "reverse")}
          className={toolbarToggleClass(false)}
        >
          Test Reverse
        </button>
        <button
          type="button"
          onClick={() => {
            const root = getGlbRoot();
            const result = validateWalkableRoute(root, route, from, to);
            useTourStore.getState().setRouteValidation(
              route.id,
              result.valid,
              result.validationIssues,
            );
          }}
          className={toolbarToggleClass(false)}
        >
          Rebuild smoothed path
        </button>
        <button
          type="button"
          onClick={() => {
            const root = getGlbRoot();
            const result = validateWalkableRoute(root, route, from, to);
            useTourStore.getState().setRouteValidation(
              route.id,
              result.valid,
              result.validationIssues,
            );
          }}
          className={toolbarToggleClass(false)}
        >
          Validate
        </button>
        <button
          type="button"
          onClick={() =>
            useTourStore.getState().updateRoute(route.id, {
              walkingSpeed: DEFAULT_WALKING_SPEED,
              turnRadius: DEFAULT_TURN_RADIUS,
              lookAheadDistance: 0,
              maxYawSpeedDeg: DEFAULT_YAW_SPEED_DEG,
            })
          }
          className={toolbarToggleClass(false)}
        >
          Reset motion settings
        </button>
        <button
          type="button"
          onClick={() => useTourStore.getState().deleteRoute(route.id)}
          className={`${iconButtonClass()} min-h-8 justify-center text-[#e8a4a4]`}
        >
          Delete route
        </button>
      </div>
    </div>
  );
}
