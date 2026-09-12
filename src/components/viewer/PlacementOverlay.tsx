"use client";

import { useEffect, useRef } from "react";
import {
  EYE_HEIGHT_STEP,
  MAX_EYE_HEIGHT,
  MIN_EYE_HEIGHT,
} from "@/types/tour";
import { useTourStore } from "@/store/tour-store";
import { fieldClassName, panelClassName, toolbarToggleClass } from "./chrome";

export function PlacementOverlay() {
  const isPlacementMode = useTourStore((state) => state.isPlacementMode);
  const placementDraft = useTourStore((state) => state.placementDraft);
  const eyeHeight = useTourStore((state) => state.eyeHeight);
  const notice = useTourStore((state) => state.placementNotice);
  const noticeId = useTourStore((state) => state.placementNoticeId);
  const setEyeHeight = useTourStore((state) => state.setEyeHeight);
  const cancelPlacement = useTourStore((state) => state.cancelPlacement);
  const confirmPlacement = useTourStore((state) => state.confirmPlacement);
  const clearPlacementNotice = useTourStore(
    (state) => state.clearPlacementNotice,
  );
  const confirmingRef = useRef(false);

  useEffect(() => {
    if (!isPlacementMode) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      useTourStore.getState().cancelPlacement();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPlacementMode]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => {
      clearPlacementNotice();
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [clearPlacementNotice, notice, noticeId]);

  useEffect(() => {
    confirmingRef.current = false;
  }, [placementDraft, isPlacementMode]);

  if (!isPlacementMode) return null;

  function handleConfirm() {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    const created = confirmPlacement();
    if (!created) {
      confirmingRef.current = false;
    }
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3 sm:px-4">
        <div className={`${panelClassName()} max-w-sm px-3 py-2 text-center`}>
          {placementDraft ? (
            <p className="text-xs leading-5 text-[#efece6]">
              Adjust the look direction, then confirm Start View
            </p>
          ) : (
            <>
              <p className="text-xs leading-5 text-[#efece6]">
                Click a floor to position the camera
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-[#c8c4bc]">
                Esc to cancel
              </p>
            </>
          )}
        </div>
      </div>

      {notice ? (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-3 sm:px-4">
          <div className="rounded-md border border-[#c45c4a]/35 bg-[#2a1616]/92 px-3 py-2 text-xs leading-5 text-[#f3d6d6] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
            {notice}
          </div>
        </div>
      ) : null}

      {placementDraft ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3 sm:px-4">
          <div
            className={`${panelClassName()} pointer-events-auto flex w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col gap-3 px-3 py-3`}
          >
            <label className="flex items-center justify-between gap-3">
              <span className="text-[11px] tracking-wide text-[#c8c4bc]">
                Eye height
              </span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={MIN_EYE_HEIGHT}
                  max={MAX_EYE_HEIGHT}
                  step={EYE_HEIGHT_STEP}
                  value={eyeHeight}
                  onChange={(event) =>
                    setEyeHeight(Number(event.target.value))
                  }
                  className={`${fieldClassName()} w-[4.5rem] font-mono`}
                />
                <span className="text-[11px] text-[#c8c4bc]">m</span>
              </span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                className={`${toolbarToggleClass(true)} min-h-9 flex-1 justify-center`}
              >
                Confirm viewpoint
              </button>
              <button
                type="button"
                onClick={() => cancelPlacement()}
                className={`${toolbarToggleClass(false)} min-h-9 flex-1 justify-center`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
