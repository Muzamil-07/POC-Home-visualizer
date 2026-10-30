"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2, type PerspectiveCamera } from "three";
import { useTourStore } from "@/store/tour-store";
import { selectionFromIntersection } from "@/lib/model-colors";
import { getGlbRoot } from "./glb-root";
import { findVisiblePlacementIntersection } from "./section";
import type { ModelSize } from "./editor-camera";

const raycaster = new Raycaster();
const ndc = new Vector2();

export function ColorPickLayer({ modelSize }: { modelSize: ModelSize | null }) {
  const isColorPickMode = useTourStore((state) => state.isColorPickMode);
  const gl = useThree((state) => state.gl);
  const getThree = useThree((state) => state.get);

  useEffect(() => {
    if (!isColorPickMode) return;
    const element = gl.domElement;
    let originX = 0;
    let originY = 0;
    let dragged = false;

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      originX = event.clientX;
      originY = event.clientY;
      dragged = false;
    }

    function onPointerMove(event: PointerEvent) {
      if (event.buttons === 0) return;
      const dx = event.clientX - originX;
      const dy = event.clientY - originY;
      if (dx * dx + dy * dy > 16) dragged = true;
    }

    function onPointerUp(event: PointerEvent) {
      if (event.button !== 0 || dragged) return;
      const root = getGlbRoot();
      if (!root) return;
      const store = useTourStore.getState();
      const rect = element.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
      );
      root.updateWorldMatrix(true, true);
      raycaster.firstHitOnly = false;
      raycaster.setFromCamera(ndc, getThree().camera as PerspectiveCamera);
      const found = findVisiblePlacementIntersection({
        intersections: raycaster.intersectObject(root, true),
        sectionEnabled: store.section.enabled,
        sectionHeight: store.section.height,
        modelHeight: modelSize?.height ?? 1,
        rayDirection: raycaster.ray.direction,
      });
      const selection = found
        ? selectionFromIntersection(root, found.intersection)
        : null;
      if (!selection) return;
      store.setColorSelection(selection);
      if (store.colorPickAddTo) {
        store.addPartToConfigurable(store.colorPickAddTo, {
          target: store.colorScope,
          key:
            store.colorScope === "object"
              ? selection.objectKey
              : selection.materialKey,
        });
        // Stay in pick mode so several parts can be clicked in a row.
        return;
      }
      store.setColorPickMode(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") useTourStore.getState().setColorPickMode(false);
    }

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [getThree, gl, isColorPickMode, modelSize]);

  return null;
}
