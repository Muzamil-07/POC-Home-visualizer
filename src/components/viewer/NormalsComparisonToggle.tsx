"use client";

import type { HouseNormalsVariant } from "@/lib/house-model";

type NormalsComparisonToggleProps = {
  value: HouseNormalsVariant;
  disabled?: boolean;
  onChange: (value: HouseNormalsVariant) => void;
};

export function NormalsComparisonToggle({
  value,
  disabled = false,
  onChange,
}: NormalsComparisonToggleProps) {
  return (
    <div className="pointer-events-auto explore-chrome-panel flex items-center gap-1 rounded-xl p-1">
      <p className="px-2 text-[10px] tracking-[0.12em] text-[#9aa0a6] uppercase">
        Normals
      </p>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === "original"}
        onClick={() => onChange("original")}
        className={`inline-flex min-h-8 items-center rounded-lg px-2.5 text-[12px] ${
          value === "original"
            ? "bg-[#efece6] text-[#16181c]"
            : "text-[#c8c4bc] hover:bg-white/10 hover:text-[#f4f1ea]"
        } disabled:opacity-40`}
      >
        Original
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === "generated"}
        onClick={() => onChange("generated")}
        className={`inline-flex min-h-8 items-center rounded-lg px-2.5 text-[12px] ${
          value === "generated"
            ? "bg-[#efece6] text-[#16181c]"
            : "text-[#c8c4bc] hover:bg-white/10 hover:text-[#f4f1ea]"
        } disabled:opacity-40`}
      >
        Generated
      </button>
    </div>
  );
}
