"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Raycaster, Vector3 } from "three";
import { Palette } from "lucide-react";
import type { ConfigurableItem } from "@/lib/configurables";
import { selectionFromIntersection } from "@/lib/model-colors";
import {
  getHotspotScreenPoints,
  setHotspotScreenPoints,
  subscribeHotspotScreenPoints,
  type HotspotScreenPoint,
} from "@/lib/hotspot-screen";
import { getGlbRoot } from "@/components/viewer/glb-root";

const VISIBILITY_INTERVAL = 0.25;
const MAX_MARKER_DISTANCE = 14;
const OCCLUSION_SLACK = 0.35;
const MARKER_LIFT = 0.12;
// Runs after PointToMoveController (priority 1), which stamps the
// exploration camera and renders. Earlier callbacks can see a camera that
// the editor's CameraControls has moved back to the overview pose.
const EXPLORE_PRIORITY = 2;

const raycaster = new Raycaster();
const toAnchor = new Vector3();
const forward = new Vector3();
const projected = new Vector3();

type ConfigurableHotspotTrackerProps = {
  items: readonly ConfigurableItem[];
  /** Distance and wall checks only make sense when walking inside. */
  cullHidden?: boolean;
};

function isOwnPart(item: ConfigurableItem, objectKey?: string, materialKey?: string) {
  return item.parts.some((part) =>
    part.target === "object" ? part.key === objectKey : part.key === materialKey,
  );
}

/**
 * Lives inside the Canvas. Works out which hotspots are visible and where
 * they land on screen, for ConfigurableHotspotLayer to draw.
 */
export function ConfigurableHotspotTracker({
  items,
  cullHidden = true,
}: ConfigurableHotspotTrackerProps) {
  const elapsed = useRef(VISIBILITY_INTERVAL);
  const visible = useRef<{ id: string; world: Vector3 }[]>([]);
  const getThree = useThree((state) => state.get);

  useEffect(() => () => setHotspotScreenPoints([]), []);

  useFrame(
    (_, delta) => {
      const { camera, size } = getThree();
      const root = getGlbRoot();
      if (!root) return;

      elapsed.current += delta;
      if (elapsed.current >= VISIBILITY_INTERVAL) {
        elapsed.current = 0;
        root.updateWorldMatrix(true, false);
        const next: { id: string; world: Vector3 }[] = [];
        for (const item of items) {
          const world = root.localToWorld(new Vector3(...item.anchor));
          if (cullHidden) {
            toAnchor.subVectors(world, camera.position);
            const distance = toAnchor.length();
            if (distance > MAX_MARKER_DISTANCE) continue;
            raycaster.set(camera.position, toAnchor.normalize());
            raycaster.far = distance;
            raycaster.firstHitOnly = true;
            const hit = raycaster.intersectObject(root, true)[0];
            if (hit && hit.distance < distance - OCCLUSION_SLACK) {
              // The anchor sits on the item's surface, so the item itself
              // often stands between it and the camera. That still counts.
              const blocker = selectionFromIntersection(root, hit);
              if (!isOwnPart(item, blocker?.objectKey, blocker?.materialKey)) {
                continue;
              }
            }
          }
          world.y += MARKER_LIFT;
          next.push({ id: item.id, world });
        }
        visible.current = next;
      }

      camera.getWorldDirection(forward);
      const points: HotspotScreenPoint[] = [];
      for (const marker of visible.current) {
        toAnchor.subVectors(marker.world, camera.position);
        if (toAnchor.dot(forward) <= 0) continue;
        projected.copy(marker.world).project(camera);
        if (Math.abs(projected.x) > 1.05 || Math.abs(projected.y) > 1.05) continue;
        points.push({
          id: marker.id,
          x: ((projected.x + 1) / 2) * size.width,
          y: ((1 - projected.y) / 2) * size.height,
        });
      }
      setHotspotScreenPoints(points);
    },
    cullHidden ? EXPLORE_PRIORITY : 0,
  );

  return null;
}

type ConfigurableHotspotLayerProps = {
  items: readonly ConfigurableItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

/** DOM markers drawn over the canvas at the tracker's screen positions. */
export function ConfigurableHotspotLayer({
  items,
  activeId,
  onSelect,
}: ConfigurableHotspotLayerProps) {
  const points = useSyncExternalStore(
    subscribeHotspotScreenPoints,
    getHotspotScreenPoints,
    getHotspotScreenPoints,
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-[16] overflow-hidden">
      {points.map((point) => {
        const item = items.find((entry) => entry.id === point.id);
        if (!item) return null;
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-label={`Change the color of ${item.name}`}
            title={`${item.name} · change color`}
            className={`configurable-hotspot pointer-events-auto absolute top-0 left-0 flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[12px] font-medium whitespace-nowrap shadow-[0_6px_18px_rgba(0,0,0,0.35)] transition-colors ${
              active
                ? "bg-[#efece6] text-[#16181c]"
                : "bg-[#16181c]/85 text-[#f4f1ea] hover:bg-[#16181c]"
            }`}
            style={{
              transform: `translate3d(${point.x}px, ${point.y}px, 0) translate(-14px, -50%)`,
            }}
          >
            <span
              className={`relative inline-flex size-6 items-center justify-center rounded-full ${
                active ? "bg-[#16181c] text-[#efece6]" : "bg-[#d7c7a2] text-[#16181c]"
              }`}
            >
              {active ? null : (
                <span className="configurable-hotspot-ping absolute inset-0 rounded-full bg-[#d7c7a2]" />
              )}
              <Palette className="relative size-3.5" strokeWidth={2} />
            </span>
            {item.name}
          </button>
        );
      })}
    </div>
  );
}
