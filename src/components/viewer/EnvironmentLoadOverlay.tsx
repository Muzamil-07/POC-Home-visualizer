"use client";

import { useEffect, useState } from "react";
import {
  beginEnvLoad,
  getEnvLoadState,
  subscribeEnvLoadState,
  type EnvLoadState,
} from "@/lib/env-progress";

export function EnvironmentLoadOverlay({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  const [state, setState] = useState<EnvLoadState>(getEnvLoadState);

  useEffect(() => subscribeEnvLoadState(setState), []);

  if (state === "ready") return null;

  return (
    <div className="absolute inset-0 z-[6] flex items-center justify-center bg-[#141618]/88">
      <div className="flex min-w-64 flex-col items-center gap-3 rounded-md border border-white/10 bg-[#16181c] px-4 py-4 text-center text-[#efece6] shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
        {state === "error" ? (
          <>
            <p className="text-[13px] leading-6 text-[#f3d6d6]">
              Day environment could not be loaded
            </p>
            <button
              type="button"
              onClick={() => {
                beginEnvLoad();
                onRetry?.();
              }}
              className="inline-flex min-h-9 items-center rounded bg-[#c45c4a] px-3 text-[12px] text-[#efece6]"
            >
              Retry
            </button>
          </>
        ) : (
          <>
            <p className="text-[11px] font-medium tracking-[0.18em] uppercase">
              Loading environment…
            </p>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/5 animate-pulse bg-[#efece6]" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
