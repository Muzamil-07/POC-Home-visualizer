"use client";

import { useEffect, useState } from "react";
import { HelpCircle, Maximize2, Minimize2, Sparkles, Undo2, X } from "lucide-react";
import {
  explorationIdleHint,
  getExplorationUi,
  setExplorationUi,
  subscribeExplorationUi,
} from "@/lib/exploration-ui";
import { requestReturnToEntrance } from "@/lib/exploration-session";
import { LookAroundHint } from "./LookAroundHint";

type ExplorationChromeProps = {
  title: string;
  subtitle?: string;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onExit?: () => void;
  exitLabel?: string;
  onAiRender?: () => void;
  aiRenderActive?: boolean;
};

export function ExplorationChrome({
  title,
  subtitle = "Explore the house",
  fullscreen,
  onToggleFullscreen,
  onExit,
  exitLabel = "Exit Tour",
  onAiRender,
  aiRenderActive = false,
}: ExplorationChromeProps) {
  const [ui, setUi] = useState(getExplorationUi);
  const [touch] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches,
  );

  useEffect(() => subscribeExplorationUi(setUi), []);

  const showLookCoach = ui.status === "idle" && Boolean(ui.hint);
  const showStatusHint =
    Boolean(ui.hint) && ui.status !== "idle" && ui.status !== null;

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-[18] bg-[#141618] transition-opacity duration-200"
        style={{
          opacity: ui.fade,
          visibility: ui.fade > 0.02 ? "visible" : "hidden",
        }}
      />

      {/* Single unified bar — one height, one panel, clear hierarchy */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:justify-start sm:p-4">
        <div className="explore-chrome-panel pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-2xl p-1 sm:w-auto sm:max-w-[28rem] sm:gap-2 sm:pr-1.5">
          <div className="min-w-0 flex-1 px-2.5 py-1.5 sm:max-w-[16rem] sm:flex-none sm:px-3">
            <p className="truncate text-[13px] font-medium leading-tight tracking-[-0.02em] text-[#f4f1ea] sm:text-[14px]">
              {title}
            </p>
            <p className="mt-0.5 hidden truncate text-[11px] leading-tight text-[#8b9198] sm:block">
              {subtitle}
            </p>
          </div>

          <span
            className="hidden h-6 w-px shrink-0 bg-white/10 sm:block"
            aria-hidden
          />

          <div className="flex shrink-0 items-center">
            <ChromeButton
              onClick={() => requestReturnToEntrance()}
              label="Return to Entrance"
            >
              <Undo2 className="size-[18px]" strokeWidth={1.75} />
            </ChromeButton>
            <ChromeButton
              onClick={() =>
                setExplorationUi({
                  helpOpen: !ui.helpOpen,
                  hint: ui.helpOpen ? null : explorationIdleHint(touch),
                  status: ui.helpOpen ? null : "idle",
                })
              }
              label="Help"
              active={ui.helpOpen}
            >
              <HelpCircle className="size-[18px]" strokeWidth={1.75} />
            </ChromeButton>
            <ChromeButton
              onClick={onToggleFullscreen}
              label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {fullscreen ? (
                <Minimize2 className="size-[18px]" strokeWidth={1.75} />
              ) : (
                <Maximize2 className="size-[18px]" strokeWidth={1.75} />
              )}
            </ChromeButton>
            {onExit ? (
              <ChromeButton onClick={onExit} label={exitLabel}>
                <X className="size-[18px]" strokeWidth={1.75} />
              </ChromeButton>
            ) : null}
          </div>
        </div>
      </header>

      {showLookCoach ? (
        <LookAroundHint
          touch={touch}
          lookLabel="Drag to look around"
          moveLabel={touch ? "Tap a floor to move" : "Click a floor to move"}
          className={
            onAiRender && !aiRenderActive
              ? "pr-[11.5rem] sm:pr-4"
              : undefined
          }
        />
      ) : null}

      {showStatusHint ? (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-3 sm:bottom-7 ${
            onAiRender && !aiRenderActive ? "pr-[11.5rem] sm:pr-4" : ""
          }`}
        >
          <p className="explore-chrome-panel max-w-[min(92vw,24rem)] rounded-2xl px-3 py-2 text-center text-[12px] leading-5 text-[#d7d2c8]">
            {ui.hint}
          </p>
        </div>
      ) : null}

      {onAiRender && !aiRenderActive ? (
        <div className="pointer-events-none absolute right-3 bottom-[max(0.9rem,env(safe-area-inset-bottom))] z-[21] sm:right-4 sm:bottom-7">
          <button
            type="button"
            onClick={onAiRender}
            aria-label="Open AI Visualization to render this viewpoint"
            className="explore-chrome-panel explore-ai-fab pointer-events-auto inline-flex min-h-11 max-w-[11rem] items-center gap-2 rounded-full pl-2.5 pr-3 text-left text-[#efece6] transition-[transform,background-color] duration-200 hover:bg-white/8 active:scale-[0.98] sm:min-h-12 sm:max-w-[13.5rem] sm:pl-3 sm:pr-3.5"
          >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#d7c7a2]/16 text-[#d7c7a2] sm:size-9">
              <Sparkles className="size-4 sm:size-[18px]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[12px] font-medium tracking-[-0.02em] text-[#f4f1ea] sm:text-[13px]">
                AI Visualization
              </span>
              <span className="mt-0.5 block text-[10px] text-[#9aa0a6] sm:text-[11px]">
                Render this viewpoint
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </>
  );
}

function ChromeButton({
  children,
  onClick,
  label,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      className={`explore-chrome-btn inline-flex size-10 shrink-0 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-200 sm:size-9 ${
        active
          ? "bg-[#efece6] text-[#16181c]"
          : "text-[#c8c4bc] hover:bg-white/10 hover:text-[#f4f1ea] active:scale-[0.97]"
      }`}
    >
      {children}
    </button>
  );
}
