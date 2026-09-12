"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
} from "lucide-react";
import type { PublishedViewpoint } from "@/lib/tour-schema";
import { toolbarToggleClass } from "@/components/viewer/chrome";

type PublicTourChromeProps = {
  title: string;
  viewpoints: PublishedViewpoint[];
  activeId: string | null;
  autoplayEnabled: boolean;
  playing: boolean;
  fullscreen: boolean;
  onSelect: (id: string) => void;
  onTogglePlay: () => void;
  onToggleFullscreen: () => void;
};

export function PublicTourChrome({
  title,
  viewpoints,
  activeId,
  autoplayEnabled,
  playing,
  fullscreen,
  onSelect,
  onTogglePlay,
  onToggleFullscreen,
}: PublicTourChromeProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState(true);
  const index = Math.max(
    0,
    viewpoints.findIndex((viewpoint) => viewpoint.id === activeId),
  );
  const total = viewpoints.length;
  const active = viewpoints[index] ?? null;

  useEffect(() => {
    const timeout = window.setTimeout(() => setHint(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [activeId]);

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

  function step(direction: -1 | 1) {
    if (total === 0) return;
    const next = viewpoints[(index + direction + total) % total];
    if (next) onSelect(next.id);
  }

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto min-w-0 rounded-md border border-white/10 bg-[#16181c]/88 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <p className="truncate text-[13px] font-medium tracking-wide text-[#efece6]">
            {title}
          </p>
          <p className="truncate text-[11px] text-[#9aa0a6]">
            {active?.name ?? "Viewpoint"}
          </p>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleFullscreen}
            className={`${toolbarToggleClass(false)} border border-white/10 bg-[#16181c]/88 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md`}
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {fullscreen ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {fullscreen ? "Exit" : "Fullscreen"}
            </span>
          </button>
        </div>
      </header>

      {hint ? (
        <div className="pointer-events-none absolute top-20 left-1/2 z-20 -translate-x-1/2 rounded-md bg-[#16181c]/80 px-3 py-1.5 text-[12px] text-[#c8c4bc] backdrop-blur-md">
          Drag to look around
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3">
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
            <p className="w-12 shrink-0 text-center font-mono text-[12px] text-[#c8c4bc]">
              {total === 0 ? "0 / 0" : `${index + 1} / ${total}`}
            </p>
            <label className="sr-only" htmlFor="public-viewpoint-select">
              Viewpoint
            </label>
            <select
              id="public-viewpoint-select"
              value={activeId ?? ""}
              onChange={(event) => {
                if (event.target.value) onSelect(event.target.value);
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
            {autoplayEnabled ? (
              <button
                type="button"
                onClick={onTogglePlay}
                className={toolbarToggleClass(playing)}
                aria-label={playing ? "Pause autoplay" : "Play autoplay"}
              >
                {playing ? (
                  <Pause className="size-3.5" />
                ) : (
                  <Play className="size-3.5" />
                )}
                <span className="hidden sm:inline">
                  {playing ? "Pause" : "Play"}
                </span>
              </button>
            ) : null}
          </div>
          <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-1">
            {viewpoints.map((viewpoint, itemIndex) => {
              const selected = viewpoint.id === activeId;
              return (
                <button
                  key={viewpoint.id}
                  type="button"
                  data-viewpoint-id={viewpoint.id}
                  onClick={() => onSelect(viewpoint.id)}
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
