"use client";

import { useEffect, useId, useState } from "react";
import {
  Box3,
  Quaternion,
  Vector3,
} from "three";
import {
  DEFAULT_EYE_HEIGHT,
  DEFAULT_FOV,
  EYE_HEIGHT_STEP,
  MAX_EYE_HEIGHT,
  MIN_EYE_HEIGHT,
  clampEyeHeight,
  type TourViewpoint,
} from "@/types/tour";
import {
  selectCurrentViewpoints,
  useTourStore,
} from "@/store/tour-store";
import { getEditorCamera } from "./editor-camera";
import { getGlbRoot } from "./glb-root";
import {
  generateTemplateTour,
  generationStatsSummary,
  resolveFrontOutward,
} from "@/lib/tour-template-generator";
import {
  accentButtonClass,
  panelClassName,
  toolbarToggleClass,
} from "./chrome";
import { returnToOverview } from "./tour-actions";

type TemplateSize = "auto" | 6 | 8 | 10 | 12;

type TemplateTourModalProps = {
  open: boolean;
  onClose: () => void;
};

function nowIso() {
  return new Date().toISOString();
}

export function TemplateTourModal({ open, onClose }: TemplateTourModalProps) {
  if (!open) return null;
  return <TemplateTourForm onClose={onClose} />;
}

function TemplateTourForm({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const viewpoints = useTourStore(selectCurrentViewpoints);
  const isGenerating = useTourStore((state) => state.isGeneratingTemplate);
  const [templateSize, setTemplateSize] = useState<TemplateSize>("auto");
  const [eyeHeight, setEyeHeight] = useState(DEFAULT_EYE_HEIGHT);
  const [behavior, setBehavior] = useState<"replace" | "append">("replace");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isGenerating) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isGenerating, onClose]);

  async function runGenerate() {
    const store = useTourStore.getState();
    if (store.appMode !== "edit" || store.isGeneratingTemplate) return;
    const root = getGlbRoot();
    const snapshot = getEditorCamera()?.capture();
    if (!root || !snapshot) {
      setError("Load a GLB and wait for it to finish before generating a tour.");
      return;
    }

    if (
      behavior === "replace" &&
      viewpoints.length > 0 &&
      !confirmReplace
    ) {
      setConfirmReplace(true);
      return;
    }

    const center = new Box3().setFromObject(root).getCenter(new Vector3());
    const cameraPosition = new Vector3().fromArray(snapshot.position);
    const cameraForward = new Vector3(0, 0, -1).applyQuaternion(
      new Quaternion().fromArray(snapshot.quaternion),
    );
    const frontOutward = resolveFrontOutward(
      cameraPosition,
      cameraForward,
      center,
    );

    store.setTemplateGeneration(true, "Analyzing model…");
    store.setTemplateNotice(null);
    setError(null);
    onClose();

    try {
      const result = await generateTemplateTour(
        root,
        {
          eyeHeight,
          requestedStopCount: templateSize,
          frontOutward: [
            frontOutward.x,
            frontOutward.y,
            frontOutward.z,
          ],
        },
        (message) => {
          useTourStore.getState().setTemplateGeneration(true, message);
        },
      );

      const timestamp = nowIso();
      const generated: TourViewpoint[] = result.candidates.map(
        (candidate, index) => ({
          id: crypto.randomUUID(),
          name: candidate.name,
          description: candidate.description,
          position: candidate.position,
          quaternion: candidate.quaternion,
          target: candidate.target,
          fov: candidate.fov || DEFAULT_FOV,
          order: index,
          createdAt: timestamp,
          updatedAt: timestamp,
          generatedBy: "template",
          suggestedType: candidate.suggestedType,
          confidence: candidate.confidence,
        }),
      );

      console.info(
        "[template-tour]",
        generationStatsSummary(result),
        result.warning ?? null,
      );

      if (generated.length === 0) {
        store.setTemplateNotice(
          result.warning ??
            "The model does not expose enough interior floor geometry for automatic placement. Use Place Viewpoint to add interior views manually.",
        );
        return;
      }

      const selected = store.applyGeneratedViewpoints(generated, behavior);
      store.setTemplateNotice(
        result.warning ??
          `Template tour created with ${generated.length} viewpoints. Review the suggested positions and room names before presenting it.`,
      );
      if (selected) {
        store.selectViewpoint(selected.id);
      }
      onClose();
      await returnToOverview();
    } catch (generationError) {
      console.error(generationError);
      setError("Couldn't generate a template tour from this model.");
    } finally {
      useTourStore.getState().setTemplateGeneration(false);
    }
  }

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${panelClassName()} w-full max-w-md rounded-md border border-white/10 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.4)]`}
      >
        <h2 id={titleId} className="text-[15px] font-medium">
          Generate Template House Tour
        </h2>
        <p className="mt-2 text-[12px] leading-5 text-[#c8c4bc]">
          Orbit the model so you are looking toward the main entrance. The
          current editor camera will define the front side of the house.
        </p>

        <fieldset className="mt-4">
          <legend className="text-[11px] text-[#9aa0a6]">Number of stops</legend>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(["auto", 6, 8, 10, 12] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={templateSize === value}
                onClick={() => setTemplateSize(value)}
                className={toolbarToggleClass(templateSize === value)}
              >
                {value === "auto" ? "Auto" : value}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 flex flex-col gap-1">
          <span className="flex items-center justify-between text-[11px] text-[#9aa0a6]">
            Eye height
            <span className="font-mono text-[#c8c4bc]">
              {eyeHeight.toFixed(2)} m
            </span>
          </span>
          <input
            type="range"
            min={MIN_EYE_HEIGHT}
            max={MAX_EYE_HEIGHT}
            step={EYE_HEIGHT_STEP}
            value={eyeHeight}
            onChange={(event) =>
              setEyeHeight(clampEyeHeight(Number(event.target.value)))
            }
          />
        </label>

        <fieldset className="mt-4">
          <legend className="text-[11px] text-[#9aa0a6]">
            Existing viewpoints
          </legend>
          <div className="mt-1.5 flex gap-1">
            <button
              type="button"
              aria-pressed={behavior === "replace"}
              onClick={() => {
                setBehavior("replace");
                setConfirmReplace(false);
              }}
              className={toolbarToggleClass(behavior === "replace")}
            >
              Replace
            </button>
            <button
              type="button"
              aria-pressed={behavior === "append"}
              onClick={() => {
                setBehavior("append");
                setConfirmReplace(false);
              }}
              className={toolbarToggleClass(behavior === "append")}
            >
              Append
            </button>
          </div>
        </fieldset>

        <p className="mt-4 text-[11px] leading-5 text-[#9aa0a6]">
          Room names and positions are suggestions. Review and adjust them
          after generation.
        </p>

        {confirmReplace && viewpoints.length > 0 ? (
          <p className="mt-3 rounded border border-[#c45c4a]/35 bg-[#2a1616]/80 px-3 py-2 text-[12px] leading-5 text-[#f3d6d6]">
            {`This will replace ${viewpoints.length} existing ${
              viewpoints.length === 1 ? "viewpoint" : "viewpoints"
            }. Generate again to confirm.`}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 text-[12px] leading-5 text-[#f3d6d6]">{error}</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={isGenerating}
            onClick={onClose}
            className={toolbarToggleClass(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => void runGenerate()}
            className={accentButtonClass(isGenerating)}
          >
            {confirmReplace && behavior === "replace"
              ? "Replace and generate"
              : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TemplateTourProgress() {
  const generating = useTourStore((state) => state.isGeneratingTemplate);
  const progress = useTourStore((state) => state.generationProgress);
  if (!generating) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[65] flex items-center justify-center bg-[#141618]/55 backdrop-blur-[2px]">
      <div className={`${panelClassName()} min-w-56 rounded-md border border-white/10 px-4 py-3`}>
        <p className="text-[12px] text-[#efece6]">
          {progress ?? "Analyzing model…"}
        </p>
      </div>
    </div>
  );
}

export function TemplateTourBanner() {
  const notice = useTourStore((state) => state.templateNotice);
  const canUndo = useTourStore((state) => state.templateUndoList !== null);
  const setTemplateNotice = useTourStore((state) => state.setTemplateNotice);
  const undoTemplateGeneration = useTourStore(
    (state) => state.undoTemplateGeneration,
  );

  if (!notice) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-md border border-white/10 bg-[#16181c]/94 px-3 py-2 text-[#efece6] shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
        <p className="text-[12px] leading-5">{notice}</p>
        <div className="flex shrink-0 items-center gap-1">
          {canUndo ? (
            <button
              type="button"
              onClick={() => undoTemplateGeneration()}
              className={toolbarToggleClass(false)}
            >
              Undo template generation
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setTemplateNotice(null)}
            className={toolbarToggleClass(false)}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
