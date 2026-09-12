"use client";

import { formatMeters } from "./glb";
import {
  GROUND_COLOR_PRESETS,
  groundSliderRange,
  type GroundSettings,
} from "@/lib/ground";
import { fieldClassName, toolbarToggleClass } from "./chrome";

type GroundControlsProps = {
  modelHeight: number;
  minY?: number;
  detectedY: number;
  ground: GroundSettings;
  onChange: (patch: Partial<GroundSettings>) => void;
  onReset: () => void;
};

export function GroundControls({
  modelHeight,
  minY = 0,
  detectedY,
  ground,
  onChange,
  onReset,
}: GroundControlsProps) {
  const range = groundSliderRange(
    minY,
    modelHeight,
    detectedY,
    ground.siteGradeY,
  );
  const step = Math.max(0.01, (range.max - range.min) / 200);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-4 text-[#9aa0a6]">
        Surrounding ground sits under the house so the model is not buried.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-[11px] text-[#9aa0a6]">
          Ground level
          <span className="font-mono text-[#efece6]">
            {formatMeters(ground.siteGradeY)}
          </span>
        </span>
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={step}
          value={Math.min(range.max, Math.max(range.min, ground.siteGradeY))}
          onChange={(event) =>
            onChange({ siteGradeY: Number(event.target.value) })
          }
          className="w-full accent-[#efece6]"
        />
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-[#9aa0a6]">
        Y
        <input
          type="number"
          min={range.min}
          max={range.max}
          step={0.01}
          className={fieldClassName()}
          value={Number(ground.siteGradeY.toFixed(3))}
          onChange={(event) =>
            onChange({ siteGradeY: Number(event.target.value) })
          }
        />
      </label>

      <button
        type="button"
        onClick={onReset}
        className={`${toolbarToggleClass(false)} w-full justify-center`}
      >
        Reset to detected level
      </button>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-[#9aa0a6]">Ground color</span>
        <div className="flex gap-1">
          {GROUND_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-label={preset.label}
              aria-pressed={ground.color === preset.color}
              onClick={() => onChange({ color: preset.color })}
              className={`h-7 flex-1 rounded border ${
                ground.color === preset.color
                  ? "border-[#efece6]"
                  : "border-white/10"
              }`}
              style={{ backgroundColor: preset.color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
