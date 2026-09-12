// @ts-nocheck — paused walkable-route editor
"use client";

import { useEffect, useRef } from "react";
import {
  selectCurrentRoutes,
  selectCurrentViewpoints,
  useTourStore,
} from "@/store/tour-store";
import { validateWalkableRoute } from "@/lib/route-validation";
import { getGlbRoot } from "./glb-root";

function issuesKey(
  issues: Array<{ type: string; segmentIndex?: number; message: string }>,
) {
  return issues
    .map((issue) => `${issue.type}:${issue.segmentIndex ?? ""}:${issue.message}`)
    .join("|");
}

export function RouteValidator({ ready }: { ready: boolean }) {
  const routes = useTourStore(selectCurrentRoutes);
  const viewpoints = useTourStore(selectCurrentViewpoints);
  const modelId = useTourStore((state) => state.modelId);
  const signature = routes
    .map((route) => {
      const nodes = route.nodes
        .map((node) => node.floorPosition.join(","))
        .join(";");
      return `${route.id}:${route.fromViewpointId}:${route.toViewpointId}:${route.turnRadius}:${nodes}`;
    })
    .join("|");
  const lastRef = useRef("");

  useEffect(() => {
    if (!ready || !modelId) return;
    const root = getGlbRoot();
    const store = useTourStore.getState();
    const current = selectCurrentRoutes(store);
    const list = selectCurrentViewpoints(store);
    let changed = false;
    for (const route of current) {
      const from = list.find((item) => item.id === route.fromViewpointId);
      const to = list.find((item) => item.id === route.toViewpointId);
      if (!from || !to) continue;
      const result = validateWalkableRoute(root, route, from, to);
      if (
        result.valid === route.valid &&
        issuesKey(result.validationIssues) === issuesKey(route.validationIssues)
      ) {
        continue;
      }
      store.setRouteValidation(
        route.id,
        result.valid,
        result.validationIssues,
      );
      changed = true;
    }
    if (changed) {
      lastRef.current = signature;
    }
  }, [modelId, ready, signature, viewpoints.length]);

  return null;
}
