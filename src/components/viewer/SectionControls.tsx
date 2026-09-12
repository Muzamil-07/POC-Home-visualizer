"use client";

import { Minus, Plus } from "lucide-react";
import { useTourStore } from "@/store/tour-store";
import { formatMeters } from "./glb";
import {
  clampSectionHeight,
  sectionBoundsFromSize,
  sectionStep,
} from "./section";
import { iconButtonClass, toolbarToggleClass } from "./chrome";

type SectionControlsProps = {
  modelHeight: number;
};

export function SectionControls({ modelHeight }: SectionControlsProps) {
  const section = useTourStore((state) => state.section);
  const bounds = sectionBoundsFromSize(modelHeight);
  const step = sectionStep(bounds);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-4 text-[#9aa0a6]">
        Geometry above this height is hidden in Edit mode.
      </p>

      <button
        type="button"
        aria-pressed={section.enabled}
        onClick={() => useTourStore.getState().toggleSection(bounds)}
        className={`${toolbarToggleClass(section.enabled)} w-full justify-center`}
      >
        {section.enabled ? "Disable section" : "Enable section"}
      </button>

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-[11px] text-[#9aa0a6]">
          Cut height
          <span className="font-mono text-[#efece6]">
            {formatMeters(section.height)}
          </span>
        </span>
        <input
          type="range"
          min={bounds.minY}
          max={bounds.maxY}
          step={step}
          value={clampSectionHeight(section.height, bounds)}
          onChange={(event) =>
            useTourStore
              .getState()
              .setSectionHeight(Number(event.target.value), bounds)
          }
          className="w-full accent-[#efece6]"
        />
      </label>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() =>
            useTourStore
              .getState()
              .setSectionHeight(section.height - step, bounds)
          }
          className={iconButtonClass()}
          aria-label="Lower section height"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            useTourStore
              .getState()
              .setSectionHeight(section.height + step, bounds)
          }
          className={iconButtonClass()}
          aria-label="Raise section height"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-pressed={section.showPlane}
          onClick={() =>
            useTourStore.getState().setSectionShowPlane(!section.showPlane)
          }
          className={`${toolbarToggleClass(section.showPlane)} min-h-8 flex-1 justify-center px-2`}
        >
          Show Plane
        </button>
        <button
          type="button"
          onClick={() => useTourStore.getState().resetSection(bounds)}
          className={`${toolbarToggleClass(false)} min-h-8 justify-center px-2`}
        >
          Reset
        </button>
      </div>

      <p className="text-[10px] leading-4 text-[#7d8186]">
        Section cuts may expose open wall edges. Cross-section capping is
        outside this POC.
      </p>
    </div>
  );
}
