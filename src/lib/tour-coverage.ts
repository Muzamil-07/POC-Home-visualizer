// @ts-nocheck — paused walkable-route editor
import type { ModelSize } from "@/components/viewer/editor-camera";
import { compileWalkablePath } from "@/lib/compile-walkable-path";
import { findRoute } from "@/lib/walkable-route";
import type { TourCoverageGap } from "@/types/tour-motion";
import type { WalkableRoute } from "@/types/route";
import type { TourViewpoint } from "@/types/tour";

export function adjacentViewpointPairs(viewpoints: TourViewpoint[]) {
  return viewpoints.slice(0, -1).map((viewpoint, index) => ({
    from: viewpoint,
    to: viewpoints[index + 1]!,
  }));
}

export function compileAdjacentRoute(
  routes: WalkableRoute[],
  from: TourViewpoint,
  to: TourViewpoint,
  modelSize?: ModelSize | null,
) {
  const matched = findRoute(routes, from.id, to.id);
  if (!matched) return null;
  const compiled = compileWalkablePath({
    route: matched.route,
    sourceViewpoint: from,
    destinationViewpoint: to,
    direction: matched.reversed ? "reverse" : "forward",
    modelSize,
  });
  if (!compiled) return null;
  return { ...matched, compiled };
}

export function missingAdjacentRoutes(
  viewpoints: TourViewpoint[],
  routes: WalkableRoute[],
  modelSize?: ModelSize | null,
): TourCoverageGap[] {
  const gaps: TourCoverageGap[] = [];
  for (const pair of adjacentViewpointPairs(viewpoints)) {
    if (compileAdjacentRoute(routes, pair.from, pair.to, modelSize)) continue;
    gaps.push({
      fromId: pair.from.id,
      toId: pair.to.id,
      fromName: pair.from.name,
      toName: pair.to.name,
    });
  }
  return gaps;
}

export function sequentialRouteError(fromName: string, toName: string) {
  return `Walking path from “${fromName}” to “${toName}” is missing or invalid.\nEdit this connection before playing the Tour.`;
}
