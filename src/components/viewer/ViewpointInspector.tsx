"use client";

import { ChevronRight, Eye, Move3d, RotateCcw, ScanEye, Trash2 } from "lucide-react";
import { MAX_FOV, MIN_FOV, type TransformMode } from "@/types/tour";
import {
  selectSelectedViewpoint,
  selectStartViewpointId,
  useTourStore,
} from "@/store/tour-store";
import {
  fieldClassName,
  iconButtonClass,
  panelClassName,
  toolbarToggleClass,
} from "./chrome";
import { CollapsibleSection } from "./CollapsibleSection";
import { translatedTarget } from "./editor-camera";
import { enterExploreFromEditor, updateViewpointFromEditor } from "./tour-actions";

type ViewpointInspectorProps = {
  collapsed: boolean;
  onCollapse: (value: boolean) => void;
};

export function ViewpointInspector({
  collapsed,
  onCollapse,
}: ViewpointInspectorProps) {
  const viewpoint = useTourStore(selectSelectedViewpoint);
  const startId = useTourStore(selectStartViewpointId);
  const isStart = Boolean(viewpoint && viewpoint.id === startId);
  const transformMode = useTourStore((state) => state.transformMode);
  const updateViewpoint = useTourStore((state) => state.updateViewpoint);
  const deleteViewpoint = useTourStore((state) => state.deleteViewpoint);
  const setStartViewpointId = useTourStore((state) => state.setStartViewpointId);
  const setTransformMode = useTourStore((state) => state.setTransformMode);

  if (!viewpoint) return null;
  const selected = viewpoint;

  if (collapsed) {
    return (
      <aside className={`${panelClassName()} flex h-full w-10 shrink-0 flex-col border-l border-white/10`}>
        <button
          type="button"
          onClick={() => onCollapse(false)}
          className={iconButtonClass()}
          aria-label="Expand inspector"
        >
          <ChevronRight className="size-3.5 rotate-180" />
        </button>
      </aside>
    );
  }

  function setAxis(axis: 0 | 1 | 2, value: number) {
    const next: [number, number, number] = [...selected.position];
    next[axis] = value;
    updateViewpoint(selected.id, {
      position: next,
      target: translatedTarget(selected.target, selected.position, next),
    });
  }

  return (
    <aside
      className={`${panelClassName()} flex h-full min-h-0 w-[320px] shrink-0 flex-col overflow-hidden border-l border-white/10`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">Inspector</p>
          <p className="truncate text-[11px] text-[#9aa0a6]">{viewpoint.name}</p>
          {viewpoint.generatedBy === "template" ? (
            <p className="mt-0.5 text-[10px] text-[#9aa0a6]">
              Auto-generated
              {viewpoint.confidence
                ? ` · ${viewpoint.confidence[0]?.toUpperCase()}${viewpoint.confidence.slice(1)} confidence`
                : ""}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onCollapse(true)}
          className={`${iconButtonClass()} hidden lg:inline-flex`}
          aria-label="Collapse inspector"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <CollapsibleSection title="Details">
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[#9aa0a6]">Name</span>
              <input
                value={viewpoint.name}
                onChange={(event) =>
                  updateViewpoint(viewpoint.id, { name: event.target.value })
                }
                className={fieldClassName()}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[#9aa0a6]">Description</span>
              <textarea
                value={viewpoint.description}
                rows={3}
                onChange={(event) =>
                  updateViewpoint(viewpoint.id, {
                    description: event.target.value,
                  })
                }
                className={`${fieldClassName()} resize-none leading-5`}
                placeholder="Annotation for this camera"
              />
            </label>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Camera">
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between text-[11px] text-[#9aa0a6]">
                Field of view
                <span className="font-mono text-[#c8c4bc]">
                  {viewpoint.fov.toFixed(0)}°
                </span>
              </span>
              <input
                type="range"
                min={MIN_FOV}
                max={MAX_FOV}
                step={1}
                value={viewpoint.fov}
                onChange={(event) =>
                  updateViewpoint(viewpoint.id, {
                    fov: Number(event.target.value),
                  })
                }
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["X", "Y", "Z"] as const).map((label, index) => (
                <label key={label} className="flex flex-col gap-1">
                  <span className="text-[11px] text-[#9aa0a6]">{label}</span>
                  <input
                    type="number"
                    step={0.01}
                    value={Number(viewpoint.position[index].toFixed(3))}
                    onChange={(event) =>
                      setAxis(index as 0 | 1 | 2, Number(event.target.value))
                    }
                    className={`${fieldClassName()} font-mono`}
                  />
                </label>
              ))}
            </div>
            <p className="text-[11px] text-[#9aa0a6]">
              Height (Y):{" "}
              <span className="font-mono text-[#c8c4bc]">
                {viewpoint.position[1].toFixed(2)} m
              </span>
            </p>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Transform">
          <div className="flex flex-col gap-2">
            <div className="flex gap-1">
              {(
                [
                  ["translate", "Move", Move3d],
                  ["rotate", "Rotate", RotateCcw],
                ] as const
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={transformMode === mode}
                  onClick={() => setTransformMode(mode as TransformMode)}
                  className={toolbarToggleClass(transformMode === mode)}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateViewpointFromEditor(viewpoint.id)}
              className={toolbarToggleClass(false)}
            >
              <ScanEye className="size-3.5" />
              Update from current view
            </button>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Actions">
          <div className="flex flex-col gap-1.5">
            {isStart ? (
              <button
                type="button"
                onClick={() => void enterExploreFromEditor()}
                className={toolbarToggleClass(false)}
              >
                <Eye className="size-3.5" />
                Preview Exploration
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStartViewpointId(viewpoint.id)}
                className={toolbarToggleClass(false)}
              >
                <Eye className="size-3.5" />
                Use as Start View
              </button>
            )}
            <button
              type="button"
              onClick={() => deleteViewpoint(viewpoint.id)}
              className={toolbarToggleClass(false)}
            >
              <Trash2 className="size-3.5" />
              {isStart ? "Delete Start View" : "Delete viewpoint"}
            </button>
          </div>
        </CollapsibleSection>
      </div>
    </aside>
  );
}
