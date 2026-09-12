"use client";

/* Signed storage URLs are not a fit for next/image. */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

type BeforeAfterSliderProps = {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
};

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = "Tour view",
  afterLabel = "Visualization",
}: BeforeAfterSliderProps) {
  const [amount, setAmount] = useState(50);

  return (
    <div className="relative overflow-hidden rounded-xl bg-black/40">
      <img
        src={afterUrl}
        alt={afterLabel}
        className="block h-auto w-full select-none"
        draggable={false}
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - amount}% 0 0)` }}
      >
        <img
          src={beforeUrl}
          alt={beforeLabel}
          className="block h-full w-full object-cover select-none"
          draggable={false}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-[#efece6]/80"
        style={{ left: `${amount}%` }}
      />
      <label className="sr-only" htmlFor="ai-before-after">
        Compare original tour view and visualization
      </label>
      <input
        id="ai-before-after"
        type="range"
        min={4}
        max={96}
        value={amount}
        onChange={(event) => setAmount(Number(event.target.value))}
        className="absolute inset-0 cursor-ew-resize opacity-0"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-between px-2 text-[10px] uppercase tracking-[0.14em] text-[#efece6]/80">
        <span className="rounded bg-black/45 px-1.5 py-0.5">{beforeLabel}</span>
        <span className="rounded bg-black/45 px-1.5 py-0.5">{afterLabel}</span>
      </div>
    </div>
  );
}
