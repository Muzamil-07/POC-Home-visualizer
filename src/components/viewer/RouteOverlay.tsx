// @ts-nocheck — paused walkable-route editor
"use client";

import { useEffect } from "react";
import { selectCurrentViewpoints, useTourStore } from "@/store/tour-store";

export function RouteOverlay() {
  const mode = useTourStore((state) => state.routeEditMode);
  const connectingFromId = useTourStore((state) => state.connectingFromId);
  const viewpoints = useTourStore(selectCurrentViewpoints);
  const source = viewpoints.find((item) => item.id === connectingFromId);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const state = useTourStore.getState();
      if (state.routeEditMode === "idle") return;
      event.preventDefault();
      state.cancelRouteEdit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (mode === "idle") return null;

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-md border border-white/10 bg-[#16181c]/90 px-3 py-1.5 text-[12px] text-[#efece6] shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
      {mode === "pick-destination"
        ? `Select the destination viewpoint${source ? ` from ${source.name}` : ""}`
        : "Add path points through doors and hallways"}
    </div>
  );
}
