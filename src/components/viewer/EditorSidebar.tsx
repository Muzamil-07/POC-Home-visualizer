"use client";

import {
  Camera,
  ChevronLeft,
  Crosshair,
  Play,
  Plus,
  ScanEye,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  selectCurrentGround,
  selectCurrentViewpoints,
  selectStartViewpoint,
  useTourStore,
} from "@/store/tour-store";
import { accentButtonClass, iconButtonClass, panelClassName, toolbarToggleClass } from "./chrome";
import { CollapsibleSection } from "./CollapsibleSection";
import {
  captureStartViewFromEditor,
  enterExploreFromEditor,
} from "./tour-actions";
import {
  formatBytes,
  formatMeters,
  type ModelStats,
} from "./glb";
import { SectionControls } from "./SectionControls";
import { GroundControls } from "./GroundControls";
import { defaultGroundSettings } from "@/lib/ground";

type EditorSidebarProps = {
  modelLoaded: boolean;
  modelReady: boolean;
  modelStats: ModelStats | null;
  collapsed: boolean;
  onCollapse: (value: boolean) => void;
  onGenerateTemplate: () => void;
};

export function EditorSidebar({
  modelLoaded,
  modelReady,
  modelStats,
  collapsed,
  onCollapse,
  onGenerateTemplate,
}: EditorSidebarProps) {
  const viewpoints = useTourStore(selectCurrentViewpoints);
  const startView = useTourStore(selectStartViewpoint);
  const selectedId = useTourStore((state) => state.selectedId);
  const isPlacementMode = useTourStore((state) => state.isPlacementMode);
  const isGeneratingTemplate = useTourStore((state) => state.isGeneratingTemplate);
  const selectViewpoint = useTourStore((state) => state.selectViewpoint);
  const setStartViewpointId = useTourStore((state) => state.setStartViewpointId);
  const ground = useTourStore(selectCurrentGround);
  const detectedSiteGrade = useTourStore((state) => state.detectedSiteGrade);
  const leftover = viewpoints.filter((viewpoint) => viewpoint.id !== startView?.id);

  if (collapsed) {
    return (
      <aside className={`${panelClassName()} flex h-full w-10 shrink-0 flex-col border-r border-white/10`}>
        <button
          type="button"
          onClick={() => onCollapse(false)}
          className={iconButtonClass()}
          aria-label="Expand start view"
        >
          <ChevronLeft className="size-3.5 rotate-180" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`${panelClassName()} flex h-full min-h-0 w-[280px] shrink-0 flex-col overflow-hidden border-r border-white/10`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
        <div>
          <p className="text-[13px] font-medium">Start View</p>
          <p className="text-[11px] text-[#9aa0a6]">
            {startView ? startView.name : "Not set"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCollapse(true)}
          className={`${iconButtonClass()} hidden lg:inline-flex`}
          aria-label="Collapse start view"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 border-b border-white/8 px-3 py-2">
        <button
          type="button"
          aria-pressed={isPlacementMode}
          disabled={!modelLoaded || !modelReady}
          onClick={() => {
            const store = useTourStore.getState();
            if (store.isPlacementMode) {
              store.cancelPlacement();
              return;
            }
            store.enterPlacementMode(true);
          }}
          className={`${accentButtonClass(
            !modelLoaded || !modelReady,
          )} w-full justify-center disabled:cursor-not-allowed`}
        >
          <Crosshair className="size-3.5" />
          {startView ? "Replace on surface" : "Place Start View"}
        </button>
        <button
          type="button"
          disabled={!modelLoaded || isPlacementMode}
          onClick={() => captureStartViewFromEditor()}
          className={`${toolbarToggleClass(false)} w-full justify-center disabled:cursor-not-allowed disabled:opacity-35`}
        >
          {startView ? <ScanEye className="size-3.5" /> : <Plus className="size-3.5" />}
          {startView ? "Capture current camera" : "Capture current view"}
        </button>
        <button
          type="button"
          disabled={!startView || isPlacementMode || !modelReady}
          onClick={() => void enterExploreFromEditor()}
          className={`${toolbarToggleClass(false)} w-full justify-center disabled:cursor-not-allowed disabled:opacity-35`}
        >
          <Play className="size-3.5" />
          Preview Exploration
        </button>
        <button
          type="button"
          disabled={
            !modelLoaded || !modelReady || isPlacementMode || isGeneratingTemplate
          }
          onClick={onGenerateTemplate}
          className={`${toolbarToggleClass(false)} w-full justify-center disabled:cursor-not-allowed disabled:opacity-35`}
        >
          <Sparkles className="size-3.5" />
          Generate Template Tour
        </button>
        {startView ? (
          <button
            type="button"
            disabled={isPlacementMode}
            onClick={() => setStartViewpointId(null)}
            className={`${toolbarToggleClass(false)} w-full justify-center disabled:cursor-not-allowed disabled:opacity-35`}
          >
            <Trash2 className="size-3.5" />
            Clear Start View
          </button>
        ) : null}
      </div>

      {startView ? (
        <button
          type="button"
          onClick={() => selectViewpoint(startView.id)}
          className={`mx-3 mt-2 rounded border px-2 py-2 text-left ${
            selectedId === startView.id
              ? "border-white/20 bg-white/8"
              : "border-white/8 hover:bg-white/5"
          }`}
        >
          <p className="text-[12px] text-[#efece6]">{startView.name}</p>
          <p className="mt-0.5 text-[11px] text-[#9aa0a6]">
            Move, rotate, and adjust FOV in the inspector.
          </p>
        </button>
      ) : (
        <div className="px-3 py-6 text-center">
          <Camera className="mx-auto mb-2 size-4 text-[#9aa0a6]" />
          <p className="text-xs leading-5 text-[#9aa0a6]">
            {modelLoaded
              ? "Place Start View on the front lawn or capture the current camera."
              : "Load a GLB to set a Start View."}
          </p>
        </div>
      )}

      {leftover.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CollapsibleSection title="Other saved viewpoints" defaultOpen={false}>
            <p className="mb-2 text-[11px] leading-4 text-[#9aa0a6]">
              Older viewpoints are kept. Choose one as the Start View without deleting the rest.
            </p>
            <ul className="flex flex-col gap-0.5">
              {leftover.map((viewpoint) => (
                <li key={viewpoint.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => selectViewpoint(viewpoint.id)}
                    className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-[12px] ${
                      selectedId === viewpoint.id
                        ? "bg-white/8 text-[#efece6]"
                        : "text-[#c8c4bc] hover:bg-white/5"
                    }`}
                  >
                    {viewpoint.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStartViewpointId(viewpoint.id)}
                    className="shrink-0 rounded px-2 py-1 text-[10px] tracking-[0.12em] text-[#9aa0a6] uppercase hover:bg-white/8 hover:text-[#efece6]"
                  >
                    Use
                  </button>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {modelStats ? (
        <div className="mt-auto shrink-0 border-t border-white/8">
          <CollapsibleSection title="Model" defaultOpen>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-[#9aa0a6]">
              <dt>File</dt>
              <dd className="truncate text-right text-[#efece6]">
                {modelStats.filename}
              </dd>
              <dt>Size</dt>
              <dd className="text-right font-mono text-[#efece6]">
                {modelStats.fileSize === null
                  ? "—"
                  : formatBytes(modelStats.fileSize)}
              </dd>
              <dt>Width</dt>
              <dd className="text-right font-mono text-[#efece6]">
                {formatMeters(modelStats.width)}
              </dd>
              <dt>Height</dt>
              <dd className="text-right font-mono text-[#efece6]">
                {formatMeters(modelStats.height)}
              </dd>
              <dt>Depth</dt>
              <dd className="text-right font-mono text-[#efece6]">
                {formatMeters(modelStats.depth)}
              </dd>
              <dt>Meshes</dt>
              <dd className="text-right font-mono text-[#efece6]">
                {modelStats.meshCount.toLocaleString()}
                {modelStats.drawCallCount &&
                modelStats.drawCallCount !== modelStats.meshCount
                  ? ` → ${modelStats.drawCallCount} draws`
                  : ""}
              </dd>
              <dt>Materials</dt>
              <dd className="text-right font-mono text-[#efece6]">
                {modelStats.materialCount}
              </dd>
            </dl>
            <div className="mt-3 border-t border-white/8 pt-3">
              <p className="mb-2 text-[12px] text-[#efece6]">Ground</p>
              <GroundControls
                modelHeight={modelStats.height}
                detectedY={detectedSiteGrade ?? ground?.siteGradeY ?? 0}
                ground={
                  ground ??
                  defaultGroundSettings(0, modelStats.height)
                }
                onChange={(patch) =>
                  useTourStore.getState().setGroundSettings(patch)
                }
                onReset={() =>
                  useTourStore
                    .getState()
                    .resetGroundToDetected(
                      defaultGroundSettings(0, modelStats.height),
                    )
                }
              />
            </div>
          </CollapsibleSection>
          <CollapsibleSection title="Section Cut" defaultOpen>
            <SectionControls modelHeight={modelStats.height} />
          </CollapsibleSection>
        </div>
      ) : null}
    </aside>
  );
}
