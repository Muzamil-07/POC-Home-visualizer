// @ts-nocheck — paused walkable-route editor
"use client";

import { findRoute } from "@/lib/walkable-route";
import {
  selectCurrentRoutes,
  selectCurrentViewpoints,
  useTourStore,
} from "@/store/tour-store";
import { accentButtonClass } from "./chrome";
import { exitTour } from "./tour-actions";

export function TourPlaybackAlerts() {
  const coverage = useTourStore((state) => state.tourCoverageErrors);
  const navError = useTourStore((state) => state.tourNavError);

  if (coverage && coverage.length > 0) {
    return (
      <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
        <div className="w-full max-w-md rounded-md border border-white/10 bg-[#16181c] px-4 py-4 text-[#efece6] shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          <p className="text-[15px] font-medium">Tour cannot start</p>
          <p className="mt-3 text-[12px] text-[#c8c4bc]">Missing or invalid paths:</p>
          <ul className="mt-2 flex flex-col gap-1 text-[12px] text-[#efece6]">
            {coverage.map((gap) => (
              <li key={`${gap.fromId}-${gap.toId}`}>
                • {gap.fromName} → {gap.toName}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`${accentButtonClass(false)} mt-4`}
            onClick={() => {
              const store = useTourStore.getState();
              const first = store.tourCoverageErrors?.[0];
              store.setTourCoverageErrors(null);
              const openEditor = () => {
                const live = useTourStore.getState();
                live.setInspectorOpen(true);
                if (!first) return;
                const matched = findRoute(
                  selectCurrentRoutes(live),
                  first.fromId,
                  first.toId,
                );
                if (matched) live.selectRoute(matched.route.id);
                else {
                  const from = selectCurrentViewpoints(live).find(
                    (item) => item.id === first.fromId,
                  );
                  if (from) live.selectViewpoint(from.id);
                }
              };
              if (store.appMode === "tour") {
                void exitTour().then(openEditor);
                return;
              }
              openEditor();
            }}
          >
            Open Route Editor
          </button>
        </div>
      </div>
    );
  }

  if (!navError) return null;

  return (
    <div className="absolute inset-x-0 top-14 z-[60] flex justify-center px-3">
      <div className="flex max-w-lg items-start gap-3 rounded-md border border-red-400/25 bg-[#2a1616]/92 px-3 py-2 text-[#f3d6d6] shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
        <p className="whitespace-pre-line text-xs leading-5">{navError}</p>
        <button
          type="button"
          onClick={() => useTourStore.getState().setTourNavError(null)}
          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-[#f3d6d6] hover:bg-white/8"
          aria-label="Dismiss error"
        >
          ×
        </button>
      </div>
    </div>
  );
}
