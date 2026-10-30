"use client";

import { Palette, Pipette, RotateCcw, X } from "lucide-react";
import { selectCurrentColorOverrides, useTourStore } from "@/store/tour-store";
import { COLOR_PRESETS, type ModelColorOverride } from "@/lib/model-colors";
import { toolbarToggleClass } from "./chrome";
import { ConfigurableControls } from "./ConfigurableControls";

function overrideLabel(override: Pick<ModelColorOverride, "target" | "key">) {
  const id = override.key.slice(1);
  return override.target === "object" ? `Object ${id}` : `All matching · group ${id}`;
}

export function ColorControls({ disabled }: { disabled: boolean }) {
  const overrides = useTourStore(selectCurrentColorOverrides);
  const selection = useTourStore((state) => state.colorSelection);
  const isColorPickMode = useTourStore((state) => state.isColorPickMode);
  const scope = useTourStore((state) => state.colorScope);
  const setScope = useTourStore((state) => state.setColorScope);
  const addingPart = useTourStore((state) => Boolean(state.colorPickAddTo));

  const selectedKey = selection
    ? scope === "object"
      ? selection.objectKey
      : selection.materialKey
    : null;
  const applied = selectedKey
    ? overrides.find((item) => item.target === scope && item.key === selectedKey)
    : undefined;
  const shownColor = applied?.color ?? selection?.currentColor ?? "#ffffff";

  function apply(color: string) {
    if (!selectedKey) return;
    useTourStore
      .getState()
      .setColorOverride({ target: scope, key: selectedKey, color: color.toLowerCase() });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-4 text-[#9aa0a6]">
        Click a surface in the house, then choose a color. Published tours use
        the same colors.
      </p>

      <button
        type="button"
        aria-pressed={isColorPickMode}
        disabled={disabled}
        onClick={() => useTourStore.getState().setColorPickMode(!isColorPickMode)}
        className={`${toolbarToggleClass(isColorPickMode)} w-full justify-center disabled:cursor-not-allowed disabled:opacity-35`}
      >
        <Pipette className="size-3.5" />
        {isColorPickMode
          ? addingPart
            ? "Adding parts… (Esc when done)"
            : "Click a surface… (Esc to cancel)"
          : selection
            ? "Pick another object"
            : "Pick object"}
      </button>

      {selection ? (
        <div className="flex flex-col gap-2 rounded border border-white/8 p-2">
          <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Apply to">
            <button
              type="button"
              role="radio"
              aria-checked={scope === "object"}
              onClick={() => setScope("object")}
              className={`${toolbarToggleClass(scope === "object")} justify-center px-1 text-[11px]`}
            >
              This object
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scope === "material"}
              onClick={() => setScope("material")}
              className={`${toolbarToggleClass(scope === "material")} justify-center px-1 text-[11px]`}
            >
              All matching ({selection.matchingCount})
            </button>
          </div>

          <div className="flex gap-1">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-label={preset.label}
                title={preset.label}
                aria-pressed={applied?.color === preset.color}
                onClick={() => apply(preset.color)}
                className={`h-7 flex-1 rounded border ${
                  applied?.color === preset.color ? "border-[#efece6]" : "border-white/10"
                }`}
                style={{ backgroundColor: preset.color }}
              />
            ))}
          </div>

          <label className="flex items-center justify-between gap-2 text-[11px] text-[#9aa0a6]">
            Custom color
            <span className="flex items-center gap-2">
              <span className="font-mono text-[#efece6]">{shownColor}</span>
              <input
                type="color"
                value={shownColor}
                onChange={(event) => apply(event.target.value)}
                className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </span>
          </label>

          {applied ? (
            <button
              type="button"
              onClick={() =>
                useTourStore.getState().removeColorOverride(applied)
              }
              className={`${toolbarToggleClass(false)} w-full justify-center`}
            >
              <RotateCcw className="size-3.5" />
              Restore original color
            </button>
          ) : null}

          {addingPart ? null : (
            <button
              type="button"
              onClick={() => useTourStore.getState().createConfigurable()}
              className={`${toolbarToggleClass(false)} w-full justify-center border border-[#d7c7a2]/35 text-[#d7c7a2]`}
            >
              <Palette className="size-3.5" />
              Let visitors change this color
            </button>
          )}
        </div>
      ) : null}

      <ConfigurableControls />

      {overrides.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-[#9aa0a6]">
            Changed colors ({overrides.length})
          </span>
          <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
            {overrides.map((override) => (
              <li
                key={`${override.target}:${override.key}`}
                className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5"
              >
                <span
                  className="size-3.5 shrink-0 rounded-sm border border-white/15"
                  style={{ backgroundColor: override.color }}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-[#c8c4bc]">
                  {overrideLabel(override)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${overrideLabel(override)}`}
                  onClick={() => useTourStore.getState().removeColorOverride(override)}
                  className="inline-flex size-6 items-center justify-center rounded text-[#9aa0a6] hover:bg-white/10 hover:text-[#efece6]"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              const store = useTourStore.getState();
              store.clearColorOverrides();
              store.setColorSelection(null);
            }}
            className={`${toolbarToggleClass(false)} w-full justify-center`}
          >
            Reset all colors
          </button>
        </div>
      ) : null}
    </div>
  );
}
