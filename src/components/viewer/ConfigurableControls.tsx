"use client";

import { useState } from "react";
import { Crosshair, Palette, Plus, Trash2, X } from "lucide-react";
import { selectCurrentConfigurables, useTourStore } from "@/store/tour-store";
import { COLOR_PRESETS, HEX_COLOR_PATTERN } from "@/lib/model-colors";
import {
  MAX_CONFIGURABLE_COLORS,
  type ConfigurableItem,
} from "@/lib/configurables";
import { fieldClassName, toolbarToggleClass } from "./chrome";

export function ConfigurableControls() {
  const items = useTourStore(selectCurrentConfigurables);
  const activeId = useTourStore((state) => state.activeConfigurableId);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 border-t border-white/8 pt-2">
      <span className="flex items-center gap-1.5 text-[11px] text-[#efece6]">
        <Palette className="size-3.5 text-[#d7c7a2]" />
        Visitors can change ({items.length})
      </span>
      <p className="text-[11px] leading-4 text-[#9aa0a6]">
        These show a color dot on the tour. Visitors tap it to pick a color.
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((item) =>
          item.id === activeId ? (
            <ConfigurableEditor key={item.id} item={item} />
          ) : (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => useTourStore.getState().setActiveConfigurable(item.id)}
                className="flex w-full items-center gap-2 rounded border border-white/8 px-2 py-1.5 text-left text-[12px] text-[#c8c4bc] hover:bg-white/5"
              >
                <span className="flex -space-x-1">
                  {item.colors.slice(0, 4).map((color) => (
                    <span
                      key={color}
                      className="size-3 rounded-full border border-[#16181c]"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-[10px] text-[#9aa0a6]">
                  {item.parts.length} part{item.parts.length === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function ConfigurableEditor({ item }: { item: ConfigurableItem }) {
  const addingHere = useTourStore((state) => state.colorPickAddTo === item.id);
  const selection = useTourStore((state) => state.colorSelection);
  const [custom, setCustom] = useState("#a0522d");
  const update = (patch: Partial<ConfigurableItem>) =>
    useTourStore.getState().updateConfigurable(item.id, patch);

  function toggleColor(color: string) {
    const has = item.colors.includes(color);
    if (has && item.colors.length === 1) return;
    update({
      colors: has
        ? item.colors.filter((entry) => entry !== color)
        : [...item.colors, color].slice(0, MAX_CONFIGURABLE_COLORS),
    });
  }

  const extraColors = item.colors.filter(
    (color) => !COLOR_PRESETS.some((preset) => preset.color === color),
  );

  return (
    <li className="flex flex-col gap-2 rounded border border-[#d7c7a2]/35 bg-white/[0.03] p-2">
      <div className="flex items-center gap-1">
        <input
          aria-label="Name shown to visitors"
          value={item.name}
          maxLength={60}
          onChange={(event) => update({ name: event.target.value })}
          className={fieldClassName()}
        />
        <button
          type="button"
          aria-label="Close"
          onClick={() => useTourStore.getState().setActiveConfigurable(null)}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded text-[#9aa0a6] hover:bg-white/10 hover:text-[#efece6]"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#9aa0a6]">
        <span>
          {item.parts.length} part{item.parts.length === 1 ? "" : "s"}
        </span>
        {item.parts.length > 1 ? (
          <button
            type="button"
            onClick={() => update({ parts: item.parts.slice(0, 1) })}
            className="text-[10px] tracking-[0.12em] uppercase hover:text-[#efece6]"
          >
            Keep first only
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          aria-pressed={addingHere}
          onClick={() => {
            const store = useTourStore.getState();
            if (addingHere) store.setColorPickMode(false);
            else store.startAddConfigurablePart(item.id);
          }}
          className={`${toolbarToggleClass(addingHere)} justify-center px-1 text-[11px]`}
        >
          <Plus className="size-3.5" />
          {addingHere ? "Done adding" : "Add parts"}
        </button>
        <button
          type="button"
          disabled={!selection}
          onClick={() => selection && update({ anchor: selection.point })}
          title="Move the color dot to the last surface you clicked"
          className={`${toolbarToggleClass(false)} justify-center px-1 text-[11px] disabled:opacity-35`}
        >
          <Crosshair className="size-3.5" />
          Dot here
        </button>
      </div>
      {addingHere ? (
        <p className="text-[11px] leading-4 text-[#d7c7a2]">
          Click more surfaces of this item. The scope above (this object or all
          matching) applies to each click.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-[#9aa0a6]">Colors visitors can choose</span>
        <div className="flex flex-wrap gap-1">
          {[...COLOR_PRESETS.map((preset) => preset.color), ...extraColors].map(
            (color) => {
              const on = item.colors.includes(color);
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={on}
                  aria-label={color}
                  title={color}
                  onClick={() => toggleColor(color)}
                  className={`size-7 rounded border-2 ${
                    on ? "border-[#efece6]" : "border-transparent opacity-35"
                  }`}
                  style={{ backgroundColor: color }}
                />
              );
            },
          )}
        </div>
        <div className="flex items-center gap-1">
          <input
            type="color"
            aria-label="Custom color"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
          />
          <button
            type="button"
            disabled={
              !HEX_COLOR_PATTERN.test(custom) ||
              item.colors.includes(custom.toLowerCase()) ||
              item.colors.length >= MAX_CONFIGURABLE_COLORS
            }
            onClick={() => update({ colors: [...item.colors, custom.toLowerCase()] })}
            className={`${toolbarToggleClass(false)} flex-1 justify-center text-[11px] disabled:opacity-35`}
          >
            Add custom color
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => useTourStore.getState().removeConfigurable(item.id)}
        className={`${toolbarToggleClass(false)} w-full justify-center text-[11px] text-[#e3a49a]`}
      >
        <Trash2 className="size-3.5" />
        Stop letting visitors change this
      </button>
    </li>
  );
}
