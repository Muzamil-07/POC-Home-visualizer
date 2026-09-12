"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import {
  selectActiveTourViewpoint,
  selectCurrentViewpoints,
  useTourStore,
} from "@/store/tour-store";
import { accentButtonClass } from "./chrome";
import { exitTour, goToTourViewpoint } from "./tour-actions";

export function TourChrome() {
  const viewpoints = useTourStore(selectCurrentViewpoints);
  const active = useTourStore(selectActiveTourViewpoint);
  const activeId = useTourStore((state) => state.activeTourViewpointId);
  const stripRef = useRef<HTMLDivElement>(null);

  const index = Math.max(
    0,
    viewpoints.findIndex((viewpoint) => viewpoint.id === activeId),
  );
  const total = viewpoints.length;

  useEffect(() => {
    const card = stripRef.current?.querySelector<HTMLElement>(
      `[data-viewpoint-id="${activeId}"]`,
    );
    card?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        void exitTour();
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      const state = useTourStore.getState();
      const list = selectCurrentViewpoints(state);
      if (list.length === 0) return;
      const currentIndex = Math.max(
        0,
        list.findIndex((item) => item.id === state.activeTourViewpointId),
      );

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const next = list[(currentIndex - 1 + list.length) % list.length];
        if (next) void goToTourViewpoint(next.id);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        const next = list[(currentIndex + 1) % list.length];
        if (next) void goToTourViewpoint(next.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function step(direction: -1 | 1) {
    if (total === 0) return;
    const nextIndex = (index + direction + total) % total;
    const next = viewpoints[nextIndex];
    if (next) void goToTourViewpoint(next.id);
  }

  return (
    <>
      <header className="absolute inset-x-0 top-0 z-50 flex h-12 items-center justify-between gap-3 border-b border-white/10 bg-[#16181c]/92 px-3 backdrop-blur-md">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#efece6]">
            Architectural Tour
          </p>
          <p className="truncate text-[11px] text-[#9aa0a6]">
            {active?.name ?? "Viewpoint"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void exitTour()}
            className={`${accentButtonClass(false)} relative z-[80] shrink-0 shadow-[0_8px_24px_rgba(0,0,0,0.35)]`}
            style={{ pointerEvents: "auto" }}
          >
            <LogOut className="size-3.5" aria-hidden />
            Exit Tour
          </button>
        </div>
      </header>

      {activeId ? <LookAroundHint key={activeId} /> : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center p-3">
        <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-2 rounded-md border border-white/10 bg-[#16181c]/92 px-3 py-2 text-[#efece6] shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded hover:bg-white/10"
              aria-label="Previous viewpoint"
            >
              <ChevronLeft className="size-4" />
            </button>
            <p className="w-12 text-center font-mono text-[12px] text-[#c8c4bc]">
              {total === 0 ? "0 / 0" : `${index + 1} / ${total}`}
            </p>
            <label className="sr-only" htmlFor="tour-viewpoint-select">
              Viewpoint
            </label>
            <select
              id="tour-viewpoint-select"
              value={activeId ?? ""}
              onChange={(event) => {
                if (event.target.value) void goToTourViewpoint(event.target.value);
              }}
              className="min-h-9 min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 text-[12px] text-[#efece6] outline-none"
            >
              {viewpoints.map((viewpoint, itemIndex) => (
                <option key={viewpoint.id} value={viewpoint.id}>
                  {itemIndex + 1}. {viewpoint.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => step(1)}
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded hover:bg-white/10"
              aria-label="Next viewpoint"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div
            ref={stripRef}
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {viewpoints.map((viewpoint, itemIndex) => {
              const selected = viewpoint.id === activeId;
              return (
                <button
                  key={viewpoint.id}
                  type="button"
                  data-viewpoint-id={viewpoint.id}
                  onClick={() => void goToTourViewpoint(viewpoint.id)}
                  className={`min-w-[8.5rem] shrink-0 rounded border px-2.5 py-2 text-left transition-colors ${
                    selected
                      ? "border-[#c45c4a] bg-[#c45c4a]/20"
                      : "border-white/10 bg-black/20 hover:bg-white/8"
                  }`}
                >
                  <p className="truncate text-[12px] text-[#efece6]">
                    {itemIndex + 1}. {viewpoint.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function LookAroundHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 2200);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute top-16 left-1/2 z-40 -translate-x-1/2 rounded-md bg-[#16181c]/80 px-3 py-1.5 text-[12px] text-[#c8c4bc] backdrop-blur-md">
      Drag to look around
    </div>
  );
}
