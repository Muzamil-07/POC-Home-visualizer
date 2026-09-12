"use client";

import { useTourStore } from "@/store/tour-store";
import { CURATED_TOUR_FADE_MS } from "@/lib/house-model";

export function TourFadeOverlay() {
  const fade = useTourStore((state) => state.tourFade);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[70] bg-black"
      style={{
        opacity: fade,
        transition: `opacity ${CURATED_TOUR_FADE_MS}ms ease`,
      }}
      aria-hidden
    />
  );
}
