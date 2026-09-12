"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import type { PublishedTourRecord } from "@/lib/tour-schema";
import { isWebGLAvailable } from "@/lib/webgl";
import { OutdoorScene } from "@/components/viewer/OutdoorScene";
import { SiteGradeDetector } from "@/components/viewer/SiteGradeDetector";
import {
  ModelLoader,
  ModelLoadingOverlay,
} from "@/components/viewer/ModelLoader";
import type { ModelSource, ModelStats } from "@/components/viewer/glb";
import { previewClipping } from "@/components/viewer/editor-camera";
import { DAY_LIGHTING } from "@/lib/lighting";
import { resolveHouseModelUrl } from "@/lib/house-model";
import { shouldEnableShadows } from "@/lib/scene-shadows";
import type { GroundSettings } from "@/lib/ground";
import { DEFAULT_NAVIGATION, startViewFromViewpoint } from "@/lib/exploration";
import {
  resetExplorationUi,
  setExplorationUi,
} from "@/lib/exploration-ui";
import { resolveAiVisualizationSettings } from "@/lib/ai-visualization";
import {
  recoverAiVisualizationThread,
  startAiVisualization,
} from "@/lib/ai-visualization-client";
import {
  getAiVisualization,
  resetAiVisualization,
  setAiVisualization,
  subscribeAiVisualization,
} from "@/store/ai-visualization-store";
import { PointToMoveController } from "./PointToMoveController";
import { ExplorationChrome } from "./ExplorationChrome";
import { SceneCaptureBridge } from "./SceneCaptureBridge";
import { AiVisualizationDrawer } from "./AiVisualizationDrawer";

type PublicTourPlayerProps = {
  tour: PublishedTourRecord;
};

export function PublicTourPlayer({ tour }: PublicTourPlayerProps) {
  const startView = tour.tourData.startView;
  const navigation = tour.tourData.navigation ?? DEFAULT_NAVIGATION;
  const rootRef = useRef<HTMLDivElement>(null);
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [webgl] = useState(() => isWebGLAvailable());
  const [fullscreen, setFullscreen] = useState(false);
  const [ground, setGround] = useState<GroundSettings>(
    tour.tourData.scene.ground,
  );
  const aiSettings = resolveAiVisualizationSettings(tour.tourData.aiVisualization);
  const [aiOpen, setAiOpen] = useState(() => getAiVisualization().open);

  const source = useMemo<ModelSource>(
    () => ({
      url: resolveHouseModelUrl(tour.tourData.model.url),
      filename: tour.tourData.model.filename || "model.glb",
      fileSize: tour.tourData.model.byteSize ?? null,
      lastModified: null,
      useDraco: true,
      useMeshopt: true,
    }),
    [tour.tourData.model.byteSize, tour.tourData.model.filename, tour.tourData.model.url],
  );

  useEffect(() => {
    // Avoid a leftover full-screen fade covering the loader before the
    // exploration controller mounts and owns the intro sequence.
    resetExplorationUi();
    setExplorationUi({ fade: 0, hint: null, status: null, arrivedOnce: false });
    resetAiVisualization(aiSettings.enabled);
    setAiVisualization({ tourSlug: tour.slug, enabled: aiSettings.enabled });
    if (aiSettings.enabled) {
      void recoverAiVisualizationThread(tour.slug);
    }
  }, [aiSettings.enabled, tour.slug]);

  useEffect(() => subscribeAiVisualization((state) => setAiOpen(state.open)), []);

  useEffect(() => {
    function onFullscreen() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  async function toggleFullscreen() {
    const node = rootRef.current;
    if (!node) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await node.requestFullscreen();
  }

  const modelSize = modelStats
    ? {
        width: modelStats.width,
        height: modelStats.height,
        depth: modelStats.depth,
      }
    : null;
  const clip = previewClipping(modelSize);
  const enableShadows = shouldEnableShadows(modelStats);
  const shadowExtent = Math.max(
    12,
    modelStats
      ? Math.max(modelStats.width, modelStats.height, modelStats.depth) * 0.8
      : 12,
  );
  const isLoadingModel = modelStats === null && error === null;

  if (!webgl) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#141618] px-6 text-center">
        <p className="max-w-sm text-[13px] leading-6 text-[#c8c4bc]">
          This browser does not support WebGL, which is required to view this
          tour.
        </p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative h-dvh w-full overflow-hidden bg-[#141618]">
      <Canvas
        shadows={enableShadows ? "percentage" : false}
        dpr={modelStats && modelStats.meshCount > 800 ? [1, 1.25] : [1, 1.5]}
        gl={{ antialias: true, alpha: false }}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      >
        <color attach="background" args={[DAY_LIGHTING.horizonColor]} />
        <PerspectiveCamera
          makeDefault
          fov={startView.fov}
          near={clip.near}
          far={clip.far}
        />
        <OutdoorScene
          modelSize={modelSize}
          ground={ground}
          enableShadows={enableShadows}
          shadowExtent={shadowExtent}
        />
        <ModelLoader
          key={`${source.url}:${retryKey}`}
          source={source}
          wireframe={false}
          doubleSided={false}
          lockedTransform={tour.tourData.model.transform}
          autoFrame={false}
          onReady={setModelStats}
          onError={() =>
            setError("Couldn't load this model. Check the public model URL.")
          }
        />
        {modelStats ? (
          <SiteGradeDetector
            modelHeight={modelStats.height}
            enabled
            onDetected={(siteGradeY) =>
              setGround((current) =>
                current.siteGradeY > siteGradeY + 0.25
                  ? { ...current, siteGradeY }
                  : current,
              )
            }
          />
        ) : null}
        {modelStats ? (
          <PointToMoveController
            startView={startViewFromViewpoint(startView)}
            navigation={navigation}
            modelSize={modelSize}
            modelReady
          />
        ) : null}
        <SceneCaptureBridge />
      </Canvas>

      <ModelLoadingOverlay visible={isLoadingModel} />

      {error ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#141618]/80 px-6">
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-md border border-white/10 bg-[#16181c] px-4 py-4 text-center">
            <p className="text-[13px] leading-6 text-[#f3d6d6]">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setModelStats(null);
                setRetryKey((value) => value + 1);
              }}
              className="inline-flex min-h-9 items-center rounded bg-[#c45c4a] px-3 text-[12px] text-[#efece6]"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {modelStats ? (
        <ExplorationChrome
          title={tour.title}
          subtitle="Explore the house"
          fullscreen={fullscreen}
          onToggleFullscreen={() => void toggleFullscreen()}
          onAiRender={
            aiSettings.enabled
              ? () => {
                  const current = getAiVisualization();
                  if (current.open) {
                    setAiVisualization({ open: false });
                    return;
                  }
                  if (current.threadId || current.busy || current.messages.length) {
                    setAiVisualization({ open: true });
                    return;
                  }
                  void startAiVisualization(tour.slug);
                }
              : undefined
          }
          aiRenderActive={aiOpen}
        />
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-3">
          <div className="inline-block max-w-[min(90vw,20rem)] rounded-md border border-white/10 bg-[#16181c]/88 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <p className="truncate text-[13px] font-medium tracking-wide text-[#efece6]">
              {tour.title}
            </p>
            <p className="truncate text-[11px] text-[#9aa0a6]">
              Loading walkthrough…
            </p>
          </div>
        </div>
      )}

      {aiSettings.enabled ? <AiVisualizationDrawer tourSlug={tour.slug} /> : null}
    </div>
  );
}
