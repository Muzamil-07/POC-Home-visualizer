import type { TourMotionDebug } from "@/types/tour-motion";

let snapshot: TourMotionDebug | null = null;
const listeners = new Set<() => void>();

export function setTourMotionDebug(next: TourMotionDebug | null) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getTourMotionDebug() {
  return snapshot;
}

export function subscribeTourMotionDebug(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
