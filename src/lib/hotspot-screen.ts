// Screen positions of configurable hotspots, written by the in-canvas tracker
// each frame and read by the DOM layer drawn over the canvas.

export type HotspotScreenPoint = { id: string; x: number; y: number };

let points: HotspotScreenPoint[] = [];
const listeners = new Set<() => void>();

export function getHotspotScreenPoints() {
  return points;
}

export function setHotspotScreenPoints(next: HotspotScreenPoint[]) {
  const same =
    next.length === points.length &&
    next.every((point, index) => {
      const prev = points[index];
      return (
        prev?.id === point.id &&
        Math.abs(prev.x - point.x) < 0.5 &&
        Math.abs(prev.y - point.y) < 0.5
      );
    });
  if (same) return;
  points = next;
  for (const listener of listeners) listener();
}

export function subscribeHotspotScreenPoints(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
