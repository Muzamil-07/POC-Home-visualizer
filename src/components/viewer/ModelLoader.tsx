"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { GLBModel, clearGltfPromise, type ModelTransform } from "./GLBModel";
import type { ModelSource, ModelStats } from "./glb";
import {
  getModelLoadProgress,
  subscribeModelLoadProgress,
  type ModelLoadProgress,
} from "@/lib/load-progress";

type ModelLoaderProps = {
  source: ModelSource;
  wireframe: boolean;
  doubleSided: boolean;
  onReady: (stats: ModelStats) => void;
  onError: (message: string) => void;
  lockedTransform?: ModelTransform | null;
  autoFrame?: boolean;
};

type ErrorBoundaryProps = {
  children: ReactNode;
  onError: (message: string) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

class ModelErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError(
      "Couldn't load this GLB. The file may be invalid or corrupted.",
    );
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function clearModelCache(url: string) {
  clearGltfPromise(url);
}

export function releaseModelSource(source: ModelSource | null) {
  if (!source) return;
  clearGltfPromise(source.url);
  if (source.url.startsWith("blob:")) {
    URL.revokeObjectURL(source.url);
  }
}

export function ModelLoadingOverlay({ visible }: { visible: boolean }) {
  const [progress, setProgress] = useState<ModelLoadProgress | null>(
    getModelLoadProgress,
  );

  useEffect(() => subscribeModelLoadProgress(setProgress), []);

  if (!visible) return null;

  const percent =
    progress?.ratio == null
      ? null
      : Math.max(0, Math.min(100, progress.ratio * 100));

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[#141618]/88 backdrop-blur-[3px]">
      <div className="flex min-w-64 max-w-[min(90vw,22rem)] flex-col gap-2 rounded-md border border-white/10 bg-[#16181c] px-4 py-3.5 text-[#efece6] shadow-[0_12px_32px_rgba(0,0,0,0.4)]">
        <p className="text-[11px] font-medium tracking-[0.18em] uppercase">
          {progress?.message?.toLowerCase().startsWith("upload")
            ? "Uploading model"
            : "Loading model"}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-[#efece6] transition-[width] duration-150"
            style={{ width: `${percent ?? 18}%` }}
          />
        </div>
        <p className="text-[12px] leading-5 text-[#c8c4bc]">
          {progress?.message ?? "Preparing model…"}
        </p>
        {percent != null ? (
          <p className="font-mono text-xs text-[#9aa0a6]">
            {percent.toFixed(0)}%
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ModelLoader({
  source,
  wireframe,
  doubleSided,
  onReady,
  onError,
  lockedTransform = null,
  autoFrame = true,
}: ModelLoaderProps) {
  return (
    <ModelErrorBoundary key={source.url} onError={onError}>
      <GLBModel
        key={source.url}
        source={source}
        wireframe={wireframe}
        doubleSided={doubleSided}
        onReady={onReady}
        lockedTransform={lockedTransform}
        autoFrame={autoFrame}
      />
    </ModelErrorBoundary>
  );
}
