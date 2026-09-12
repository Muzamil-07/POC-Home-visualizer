"use client";

type LookAroundHintProps = {
  touch: boolean;
  moveLabel: string;
  lookLabel: string;
  className?: string;
};

/**
 * Animated coach mark for look-around. Compact on mobile so it doesn’t crowd
 * the 3D view; richer on larger screens.
 */
export function LookAroundHint({
  touch,
  moveLabel,
  lookLabel,
  className,
}: LookAroundHintProps) {
  return (
    <div
      className={`explore-hint pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-3 sm:bottom-7${className ? ` ${className}` : ""}`}
    >
      <div className="explore-hint-card explore-chrome-panel flex items-center gap-2.5 rounded-2xl px-2.5 py-2 text-[#efece6] sm:gap-3 sm:px-3.5 sm:py-2.5">
        <div
          className="explore-hint-visual relative flex size-9 shrink-0 items-center justify-center sm:size-12"
          aria-hidden
        >
          {touch ? <TouchDragGlyph /> : <MouseDragGlyph />}
        </div>
        <div className="min-w-0 leading-snug">
          <p className="text-[12px] font-medium tracking-[-0.01em] text-[#f4f1ea] sm:text-[13px]">
            {lookLabel}
          </p>
          <p className="mt-0.5 text-[10px] tracking-wide text-[#9aa0a6] sm:text-[11px]">
            {moveLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function MouseDragGlyph() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="size-8 overflow-visible sm:size-11"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="explore-drag-arc explore-drag-arc-left"
        d="M14 24c0-6 4.5-10 10-10"
        stroke="rgba(239,236,230,0.35)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        className="explore-drag-arc explore-drag-arc-right"
        d="M34 24c0-6-4.5-10-10-10"
        stroke="rgba(239,236,230,0.35)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <g className="explore-drag-pointer">
        <rect
          x="18.5"
          y="12"
          width="11"
          height="18"
          rx="5.5"
          fill="rgba(22,24,28,0.92)"
          stroke="#efece6"
          strokeWidth="1.4"
        />
        <line
          x1="24"
          y1="14.5"
          x2="24"
          y2="19"
          stroke="#efece6"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

function TouchDragGlyph() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="size-8 overflow-visible sm:size-11"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="explore-drag-arc explore-drag-arc-left"
        d="M12 26c2-7 8-12 14-12"
        stroke="rgba(239,236,230,0.35)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        className="explore-drag-arc explore-drag-arc-right"
        d="M36 26c-2-7-8-12-14-12"
        stroke="rgba(239,236,230,0.35)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <g className="explore-drag-pointer">
        <path
          d="M22.5 14.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5v9.2l2.1-1.4c1.2-.8 2.8-.3 3.3 1l.4 1.1c.3.8 0 1.7-.7 2.1L24.5 34.5c-.5.3-1.1.3-1.6 0l-5.2-3.2c-.7-.4-1-1.3-.7-2.1l.9-2.4c.2-.6.7-1 1.3-1.1l3.3-.5V14.5Z"
          fill="rgba(22,24,28,0.92)"
          stroke="#efece6"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
