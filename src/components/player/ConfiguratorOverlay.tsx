"use client";

import { Check, Palette, RotateCcw, X } from "lucide-react";
import type { ConfigurableItem } from "@/lib/configurables";
import { useConfiguratorStore } from "@/store/configurator-store";

type ConfiguratorOverlayProps = {
  items: readonly ConfigurableItem[];
};

/** Discovery hint plus the color panel for the open configurable item. */
export function ConfiguratorOverlay({ items }: ConfiguratorOverlayProps) {
  const openId = useConfiguratorStore((state) => state.openId);
  const choices = useConfiguratorStore((state) => state.choices);
  const hasOpened = useConfiguratorStore((state) => state.hasOpened);
  const hintDismissed = useConfiguratorStore((state) => state.hintDismissed);
  const item = items.find((entry) => entry.id === openId) ?? null;

  if (items.length === 0) return null;

  const names = items.map((entry) => entry.name);
  const listed =
    names.length > 2
      ? `${names.slice(0, 2).join(", ")} and more`
      : names.join(" and ");

  return (
    <>
      {!hasOpened && !hintDismissed ? (
        <div className="pointer-events-none absolute inset-x-0 top-[4.75rem] z-[21] flex justify-center px-3 sm:top-4 sm:right-4 sm:left-auto sm:justify-end">
          <div className="explore-chrome-panel explore-hint-card pointer-events-auto flex max-w-[min(92vw,22rem)] items-center gap-2.5 rounded-2xl py-2 pr-1.5 pl-2.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#d7c7a2] text-[#16181c]">
              <Palette className="size-4" strokeWidth={2} />
            </span>
            <p className="min-w-0 text-[12px] leading-snug text-[#d7d2c8]">
              <span className="font-medium text-[#f4f1ea]">Make it yours.</span>{" "}
              Tap a <span className="text-[#d7c7a2]">color dot</span> to change
              the color of the {listed}.
            </p>
            <button
              type="button"
              onClick={() => useConfiguratorStore.getState().dismissHint()}
              aria-label="Dismiss tip"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-[#9aa0a6] hover:bg-white/10 hover:text-[#f4f1ea]"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : null}

      {item ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+5rem))] z-[22] flex justify-center px-3 sm:bottom-32">
          <section
            role="dialog"
            aria-label={`Configure ${item.name}`}
            className="explore-chrome-panel pointer-events-auto w-full max-w-[23.5rem] rounded-2xl p-3"
          >
            <div className="mb-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium tracking-[-0.02em] text-[#f4f1ea]">
                  {item.name}
                </p>
                <p className="text-[11px] text-[#9aa0a6]">Choose a color</p>
              </div>
              <button
                type="button"
                onClick={() => useConfiguratorStore.getState().open(null)}
                aria-label="Close color options"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-[#c8c4bc] hover:bg-white/10 hover:text-[#f4f1ea]"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colors">
              <button
                type="button"
                role="radio"
                aria-checked={!choices[item.id]}
                onClick={() =>
                  useConfiguratorStore.getState().setChoice(item.id, null)
                }
                title="Original"
                aria-label="Original color"
                className={`inline-flex size-10 items-center justify-center rounded-full border text-[#c8c4bc] ${
                  !choices[item.id]
                    ? "border-[#efece6] bg-white/12"
                    : "border-white/15 hover:bg-white/8"
                }`}
              >
                <RotateCcw className="size-4" strokeWidth={1.75} />
              </button>
              {item.colors.map((color) => {
                const selected = choices[item.id] === color;
                return (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={color}
                    title={color}
                    onClick={() =>
                      useConfiguratorStore.getState().setChoice(item.id, color)
                    }
                    className={`inline-flex size-10 items-center justify-center rounded-full border-2 transition-transform active:scale-95 ${
                      selected ? "border-[#efece6]" : "border-white/10 hover:scale-105"
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    {selected ? (
                      <Check
                        className="size-4 text-white mix-blend-difference"
                        strokeWidth={2.5}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
