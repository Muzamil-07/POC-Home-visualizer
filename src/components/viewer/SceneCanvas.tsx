"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  PerspectiveCamera,
} from "@react-three/drei";
import { X } from "lucide-react";
import { selectCurrentGround, selectStartViewpoint, useTourStore } from "@/store/tour-store";
import { clippingForModel, previewClipping } from "./editor-camera";
import { DemoScene } from "./DemoScene";
import { EditHeader } from "./EditHeader";
import { EditorCameraControls } from "./EditorCameraControls";
import { EditorSidebar } from "./EditorSidebar";
import {
  ModelLoader,
  ModelLoadingOverlay,
  clearModelCache,
  releaseModelSource,
} from "./ModelLoader";
import { ViewpointInspector } from "./ViewpointInspector";
import { ViewpointAuthoringLayer } from "./ViewpointLayer";
import {
  PlacementCameraLock,
  PlacementLayer,
} from "./PlacementLayer";
import { PlacementOverlay } from "./PlacementOverlay";
import { TourChrome } from "./TourChrome";
import {
  TemplateTourBanner,
  TemplateTourModal,
  TemplateTourProgress,
} from "./TemplateTourModal";
import { TourLookControls } from "./TourLookControls";
import { PointToMoveController } from "@/components/player/PointToMoveController";
import { ExplorationChrome } from "@/components/player/ExplorationChrome";
import { DEFAULT_NAVIGATION, startViewFromViewpoint } from "@/lib/exploration";
import { exitExploreFromEditor } from "./tour-actions";
import { SectionLayer } from "./SectionLayer";
import { sectionBoundsFromSize } from "./section";
import {
  glbLoaderFlagsFromBlob,
  isGlbFileName,
  lastModifiedFromHeader,
  type ModelSource,
  type ModelStats,
} from "./glb";
import { OutdoorScene, SHOW_EDITOR_GRID } from "./OutdoorScene";
import { SiteGradeDetector } from "./SiteGradeDetector";
import { PublishTourModal } from "./PublishTourModal";
import { useUnsavedPublishedTour } from "./use-unsaved-tour";
import { usePublishStore } from "@/store/publish-store";
import {
  DEFAULT_GROUND_COLOR,
  DEFAULT_GROUND_SIZE_MULTIPLIER,
  defaultGroundSettings,
} from "@/lib/ground";
import { shouldEnableShadows } from "@/lib/scene-shadows";
import { DAY_LIGHTING } from "@/lib/lighting";
import {
  DEFAULT_HOUSE_MODEL_FILENAME,
  DEFAULT_HOUSE_MODEL_PATH,
  GENERATED_NORMALS_HOUSE_PATH,
  houseModelUrlForNormals,
  isDefaultHouseFilename,
  isHouseNormalsModelUrl,
  type HouseNormalsVariant,
} from "@/lib/house-model";
import { encodeModelUrl, isTourModelsPublicUrl } from "@/lib/model-storage";
import { NormalsComparisonToggle } from "./NormalsComparisonToggle";
import { isWebGLAvailable } from "@/lib/webgl";

const LUCAS_HOME_PATH = "/Lucas Home Enviz (1).glb";
const PUBLIC_HOUSE_PATH = "/models/house.glb";

function isSafePublicGlbPath(path: string) {
  if (isTourModelsPublicUrl(path) && path.toLowerCase().endsWith(".glb")) {
    return true;
  }
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) {
    return false;
  }
  return path.toLowerCase().endsWith(".glb");
}

function ScenePointerTracker({
  pointerRef,
}: {
  pointerRef: React.MutableRefObject<{ dragged: boolean }>;
}) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const element = gl.domElement;
    let originX = 0;
    let originY = 0;

    function onPointerDown(event: PointerEvent) {
      originX = event.clientX;
      originY = event.clientY;
      pointerRef.current.dragged = false;
    }

    function onPointerMove(event: PointerEvent) {
      if (event.buttons === 0) return;
      const dx = event.clientX - originX;
      const dy = event.clientY - originY;
      if (dx * dx + dy * dy > 16) {
        pointerRef.current.dragged = true;
      }
    }

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
    };
  }, [gl, pointerRef]);

  return null;
}

export function SceneCanvas() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<ModelSource | null>(null);
  const pointerRef = useRef({ dragged: false });
  const [source, setSource] = useState<ModelSource | null>(null);
  const [modelStats, setModelStats] = useState<ModelStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [doubleSided, setDoubleSided] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [mobileLeft, setMobileLeft] = useState(false);
  const [mobileRight, setMobileRight] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [normalsVariant, setNormalsVariant] =
    useState<HouseNormalsVariant>("original");
  const [publishOpen, setPublishOpen] = useState(false);
  const [webgl] = useState(() => isWebGLAvailable());
  const [fullscreen, setFullscreen] = useState(false);
  const canvasRootRef = useRef<HTMLDivElement>(null);
  const inspectorOpen = useTourStore((state) => state.inspectorOpen);
  const selectedId = useTourStore((state) => state.selectedId);
  const isPlacementMode = useTourStore((state) => state.isPlacementMode);
  const editorFov = useTourStore((state) => state.editorFov);
  const appMode = useTourStore((state) => state.appMode);
  const sectionEnabled = useTourStore((state) => state.section.enabled);
  const ground = useTourStore(selectCurrentGround);
  const isEdit = appMode === "edit";
  const isTour = appMode === "tour";
  const isExplore = appMode === "explore";
  const startViewpoint = useTourStore(selectStartViewpoint);
  const { dirty, hasPublished } = useUnsavedPublishedTour(
    source,
    modelStats,
  );

  const replaceSource = useCallback((next: ModelSource | null) => {
    releaseModelSource(sourceRef.current);
    if (next) {
      clearModelCache(next.url);
    }
    sourceRef.current = next;
    setSource(next);
    setModelStats(null);
    if (!next) {
      setDoubleSided(false);
    }
  }, []);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    void useTourStore.persist.rehydrate();
    void usePublishStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    function onFullscreen() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    useTourStore.getState().setCurrentModel(
      source
        ? {
            filename: source.filename,
            fileSize: source.fileSize,
            lastModified: source.lastModified,
          }
        : null,
    );
  }, [source]);

  useEffect(() => {
    return () => {
      releaseModelSource(sourceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!modelStats) return;
    useTourStore.getState().initSectionForModel(
      sectionBoundsFromSize(modelStats.height),
    );
  }, [modelStats]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDefaultModel(path: string, filename: string) {
      const encoded = encodeModelUrl(path);
      let response = await fetch(encoded, {
        method: "HEAD",
        signal: controller.signal,
      });
      if (!response.ok) {
        response = await fetch(encoded, {
          headers: { Range: "bytes=0-19" },
          signal: controller.signal,
        });
      }
      if (!response.ok && response.status !== 206 && response.status !== 405) {
        return false;
      }
      if (controller.signal.aborted || sourceRef.current) return true;

      const rangeTotal = /\/(\d+)$/.exec(
        response.headers.get("content-range") || "",
      )?.[1];
      const headerLength = Number(response.headers.get("content-length"));
      replaceSource({
        url: encoded,
        filename,
        fileSize: rangeTotal
          ? Number(rangeTotal)
          : Number.isFinite(headerLength) && headerLength > 64
            ? headerLength
            : null,
        lastModified: lastModifiedFromHeader(
          response.headers.get("Last-Modified"),
        ),
        useDraco: true,
        useMeshopt: false,
      });
      return true;
    }

    async function loadDefaultHouse() {
      try {
        const requested = new URLSearchParams(window.location.search).get(
          "model",
        );
        if (requested && isSafePublicGlbPath(requested)) {
          const filename =
            decodeURIComponent(requested.split("/").pop() || requested);
          const loadedRequested = await loadDefaultModel(requested, filename);
          if (
            loadedRequested ||
            controller.signal.aborted ||
            sourceRef.current
          ) {
            return;
          }
        }

        const loadedColored = await loadDefaultModel(
          DEFAULT_HOUSE_MODEL_PATH,
          DEFAULT_HOUSE_MODEL_FILENAME,
        );
        if (loadedColored || controller.signal.aborted || sourceRef.current) {
          setNormalsVariant("original");
          return;
        }

        const loadedGenerated = await loadDefaultModel(
          GENERATED_NORMALS_HOUSE_PATH,
          DEFAULT_HOUSE_MODEL_FILENAME,
        );
        if (loadedGenerated || controller.signal.aborted || sourceRef.current) {
          setNormalsVariant("generated");
          return;
        }

        const loadedLucas = await loadDefaultModel(
          LUCAS_HOME_PATH,
          "Lucas Home Enviz (1).glb",
        );
        if (loadedLucas || controller.signal.aborted || sourceRef.current) {
          return;
        }
        await loadDefaultModel(PUBLIC_HOUSE_PATH, "house.glb");
      } catch (loadError) {
        if ((loadError as Error).name === "AbortError") return;
      }
    }

    void loadDefaultHouse().catch((loadError) => {
      if ((loadError as Error).name !== "AbortError") {
        throw loadError;
      }
    });
    return () => controller.abort();
  }, [replaceSource]);

  async function handleFile(file: File) {
    if (!isGlbFileName(file.name)) {
      setError("Only .glb files are supported.");
      return;
    }

    try {
      const url = URL.createObjectURL(file);
      const flags = await glbLoaderFlagsFromBlob(file);
      setError(null);
      replaceSource({
        url,
        filename: file.name,
        fileSize: file.size,
        lastModified: file.lastModified,
        ...flags,
      });
    } catch {
      setError("Couldn't read this file. Please choose a valid .glb model.");
    }
  }

  function handleNormalsVariant(next: HouseNormalsVariant) {
    setNormalsVariant(next);
    const current = sourceRef.current;
    if (!current) return;
    if (
      !isDefaultHouseFilename(current.filename) &&
      !isHouseNormalsModelUrl(current.url)
    ) {
      return;
    }
    const url = houseModelUrlForNormals(next);
    if (current.url === url) return;
    replaceSource({
      ...current,
      url,
      filename: DEFAULT_HOUSE_MODEL_FILENAME,
    });
  }

  function handleRemoveModel() {
    replaceSource(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleModelError() {
    replaceSource(null);
    setError(
      "Couldn't load this GLB. The file may be invalid or corrupted.",
    );
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const enableShadows = shouldEnableShadows(modelStats);
  const sceneGround =
    ground ??
    (modelStats ? defaultGroundSettings(0, modelStats.height) : null);
  const shadowExtent = Math.max(
    12,
    modelStats
      ? Math.max(modelStats.width, modelStats.height, modelStats.depth) * 0.8
      : 12,
  );
  const isLoadingModel = source !== null && modelStats === null && error === null;
  const modelSize = modelStats
    ? {
        width: modelStats.width,
        height: modelStats.height,
        depth: modelStats.depth,
      }
    : null;
  const clip = isTour || isExplore
    ? previewClipping(modelSize)
    : clippingForModel(modelSize ?? { width: 12, height: 12, depth: 12 });
  const showInspector = isEdit && inspectorOpen && Boolean(selectedId);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[#141618]">
      {isEdit ? (
        <EditHeader
          sourceLoaded={Boolean(source)}
          modelReady={Boolean(modelStats)}
          wireframe={wireframe}
          doubleSided={doubleSided}
          leftOpen={mobileLeft}
          rightOpen={mobileRight}
          onToggleWireframe={() => setWireframe((value) => !value)}
          onToggleDoubleSided={() => setDoubleSided((value) => !value)}
          onToggleLeft={() => setMobileLeft((value) => !value)}
          onToggleRight={() => setMobileRight((value) => !value)}
          onLoadGlb={() => fileInputRef.current?.click()}
          onRemoveModel={handleRemoveModel}
          onGenerateTemplate={() => setTemplateOpen(true)}
          onPublish={() => setPublishOpen(true)}
          hasPublished={hasPublished}
          unsavedChanges={dirty}
          onToggleSection={() => {
            if (!modelStats) return;
            useTourStore
              .getState()
              .toggleSection(sectionBoundsFromSize(modelStats.height));
          }}
        />
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,model/gltf-binary"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleFile(file);
        }}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {isEdit ? (
          <div className="hidden h-full lg:flex">
            <EditorSidebar
              modelLoaded={Boolean(source)}
              modelReady={Boolean(modelStats)}
              modelStats={modelStats}
              collapsed={leftCollapsed}
              onCollapse={setLeftCollapsed}
              onGenerateTemplate={() => setTemplateOpen(true)}
            />
          </div>
        ) : null}

        {isEdit && mobileLeft ? (
          <div className="absolute inset-0 z-20 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              aria-label="Close viewpoints"
              onClick={() => setMobileLeft(false)}
            />
            <div className="relative z-10 h-full w-[280px]">
              <EditorSidebar
                modelLoaded={Boolean(source)}
                modelReady={Boolean(modelStats)}
                modelStats={modelStats}
                collapsed={false}
                onCollapse={() => setMobileLeft(false)}
                onGenerateTemplate={() => setTemplateOpen(true)}
              />
            </div>
          </div>
        ) : null}

        <div
          ref={canvasRootRef}
          className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          {!webgl ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="max-w-sm text-[13px] leading-6 text-[#c8c4bc]">
                This browser does not support WebGL, which is required to view
                the 3D house model.
              </p>
            </div>
          ) : null}
          {webgl ? (
          <Canvas
            shadows={enableShadows ? "percentage" : false}
            dpr={
              modelStats && modelStats.meshCount > 800 ? [1, 1.25] : [1, 1.5]
            }
            gl={{ antialias: true, alpha: false }}
            style={{
              width: "100%",
              height: "100%",
              cursor: isPlacementMode ? "crosshair" : undefined,
              touchAction: isTour || isExplore ? "none" : "auto",
            }}
            onPointerMissed={() => {
              const store = useTourStore.getState();
              if (store.appMode !== "edit" || store.isPlacementMode) return;
              if (!pointerRef.current.dragged) {
                store.selectViewpoint(null);
              }
            }}
          >
            <color attach="background" args={[DAY_LIGHTING.horizonColor]} />
            <PerspectiveCamera
              key={source ? "model-camera" : "placeholder-camera"}
              makeDefault
              fov={
                isExplore && startViewpoint ? startViewpoint.fov : editorFov
              }
              near={clip.near}
              far={clip.far}
            />
            <OutdoorScene
              modelSize={modelSize}
              ground={sceneGround}
              enableShadows={enableShadows}
              shadowExtent={shadowExtent}
            />
            {source && modelStats ? (
              <SiteGradeDetector
                key={source.url}
                modelHeight={modelStats.height}
                enabled
                onDetected={(siteGradeY) => {
                  const store = useTourStore.getState();
                  store.setDetectedSiteGrade(siteGradeY);
                  if (!store.modelId) return;
                  const existing = store.groundByModel[store.modelId];
                  if (
                    !existing ||
                    existing.siteGradeY > siteGradeY + 0.25
                  ) {
                    store.setGroundSettings({
                      enabled: true,
                      siteGradeY,
                      sizeMultiplier:
                        existing?.sizeMultiplier ??
                        DEFAULT_GROUND_SIZE_MULTIPLIER,
                      color: existing?.color ?? DEFAULT_GROUND_COLOR,
                    });
                  }
                }}
              />
            ) : null}
            {source ? (
              <ModelLoader
                source={source}
                wireframe={wireframe}
                doubleSided={doubleSided}
                onReady={setModelStats}
                onError={handleModelError}
              />
            ) : (
              <DemoScene wireframe={wireframe} />
            )}
            {source && isEdit ? (
              <ViewpointAuthoringLayer modelSize={modelSize} />
            ) : null}
            {source && isEdit ? (
              <PlacementLayer modelSize={modelSize} />
            ) : null}
            {source && isEdit ? <SectionLayer modelSize={modelSize} /> : null}
            {SHOW_EDITOR_GRID && isEdit ? (
              <Grid
                infiniteGrid
                cellSize={0.5}
                cellThickness={0.6}
                cellColor="#5c5a56"
                sectionSize={2}
                sectionThickness={1.15}
                sectionColor="#8a8680"
                fadeDistance={Math.max(36, shadowExtent * 2)}
                fadeStrength={1.2}
                position={[0, 0.002, 0]}
              />
            ) : null}
            <EditorCameraControls
              key={source ? "model-controls" : "placeholder-controls"}
              modelSize={modelSize}
            />
            {isTour ? <TourLookControls /> : null}
            {isExplore && startViewpoint && modelStats ? (
              <PointToMoveController
                startView={startViewFromViewpoint(startViewpoint)}
                navigation={DEFAULT_NAVIGATION}
                modelSize={modelSize}
                modelReady
              />
            ) : null}
            <PlacementCameraLock />
            <ScenePointerTracker pointerRef={pointerRef} />
            {isEdit ? (
              <GizmoHelper alignment="bottom-right" margin={[48, 48]}>
                <GizmoViewport
                  axisColors={["#c45c4a", "#6f9e5e", "#4f7ec4"]}
                  labelColor="#f2efe9"
                  hideNegativeAxes
                />
              </GizmoHelper>
            ) : null}
          </Canvas>
          ) : null}

          <ModelLoadingOverlay visible={isLoadingModel} />
          {isEdit &&
          source &&
          (isDefaultHouseFilename(source.filename) ||
            isHouseNormalsModelUrl(source.url)) ? (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10">
              <NormalsComparisonToggle
                value={normalsVariant}
                disabled={isLoadingModel}
                onChange={handleNormalsVariant}
              />
            </div>
          ) : null}
          {isEdit && sectionEnabled && source && modelStats ? (
            <div className="pointer-events-none absolute top-3 left-3 z-10">
              <span className="rounded border border-white/10 bg-[#16181c]/80 px-2 py-1 text-[10px] tracking-[0.16em] text-[#c8c4bc] uppercase">
                Section view
              </span>
            </div>
          ) : null}
          {isEdit ? <PlacementOverlay /> : null}
          {isEdit ? <TemplateTourBanner /> : null}
          {isEdit ? <TemplateTourProgress /> : null}
          {isEdit ? (
            <TemplateTourModal
              open={templateOpen}
              onClose={() => setTemplateOpen(false)}
            />
          ) : null}
          {isEdit ? (
            <PublishTourModal
              open={publishOpen}
              onClose={() => setPublishOpen(false)}
              source={source}
              stats={modelStats}
              ground={sceneGround}
            />
          ) : null}
          {isTour ? <TourChrome /> : null}
          {isExplore ? (
            <ExplorationChrome
              title="Architectural Tour"
              subtitle="Explore the house"
              fullscreen={fullscreen}
              exitLabel="Exit Preview"
              onExit={() => void exitExploreFromEditor()}
              onToggleFullscreen={() => {
                const node = canvasRootRef.current;
                if (!node) return;
                if (document.fullscreenElement) {
                  void document.exitFullscreen();
                  return;
                }
                void node.requestFullscreen();
              }}
            />
          ) : null}

          {error ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
              <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-md border border-red-400/25 bg-[#2a1616]/92 px-3 py-2 text-[#f3d6d6] shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
                <p className="text-xs leading-5">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-[#f3d6d6] hover:bg-white/8"
                  aria-label="Dismiss error"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {showInspector ? (
          <div className="hidden h-full lg:flex">
            <ViewpointInspector
              collapsed={inspectorCollapsed}
              onCollapse={setInspectorCollapsed}
            />
          </div>
        ) : null}

        {isEdit && mobileRight && selectedId ? (
          <div className="absolute inset-0 z-20 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              aria-label="Close inspector"
              onClick={() => setMobileRight(false)}
            />
            <div className="absolute inset-y-0 right-0 z-10 h-full w-[min(320px,100%)]">
              <ViewpointInspector
                collapsed={false}
                onCollapse={() => setMobileRight(false)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
