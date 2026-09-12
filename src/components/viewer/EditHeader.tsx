"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  FolderOpen,
  Layers,
  Maximize2,
  MoreHorizontal,
  Orbit,
  PanelLeft,
  PanelRight,
  Play,
  Share2,
  Slice,
  Sparkles,
  Trash2,
} from "lucide-react";
import { selectStartViewpoint, useTourStore } from "@/store/tour-store";
import { accentButtonClass, toolbarToggleClass } from "./chrome";
import { enterExploreFromEditor, returnToOverview } from "./tour-actions";

type EditHeaderProps = {
  sourceLoaded: boolean;
  modelReady: boolean;
  wireframe: boolean;
  doubleSided: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleWireframe: () => void;
  onToggleDoubleSided: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onLoadGlb: () => void;
  onRemoveModel: () => void;
  onToggleSection: () => void;
  onGenerateTemplate: () => void;
  onPublish: () => void;
  hasPublished: boolean;
  unsavedChanges: boolean;
};

export function EditHeader({
  sourceLoaded,
  modelReady,
  wireframe,
  doubleSided,
  leftOpen,
  rightOpen,
  onToggleWireframe,
  onToggleDoubleSided,
  onToggleLeft,
  onToggleRight,
  onLoadGlb,
  onRemoveModel,
  onToggleSection,
  onGenerateTemplate,
  onPublish,
  hasPublished,
  unsavedChanges,
}: EditHeaderProps) {
  const startView = useTourStore(selectStartViewpoint);
  const isPlacementMode = useTourStore((state) => state.isPlacementMode);
  const isGeneratingTemplate = useTourStore((state) => state.isGeneratingTemplate);
  const sectionEnabled = useTourStore((state) => state.section.enabled);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-[#16181c] px-3 text-[#efece6]">
      <p className="shrink-0 text-[12px] font-medium text-[#efece6]">
        Architectural Tour POC
      </p>

      <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />

      <span className="hidden items-center gap-1.5 text-[11px] text-[#9aa0a6] sm:inline-flex">
        <Orbit className="size-3.5" aria-hidden />
        Editor
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <button
          type="button"
          aria-pressed={wireframe}
          onClick={onToggleWireframe}
          className={toolbarToggleClass(wireframe)}
        >
          <Box className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Wireframe</span>
        </button>
        {sourceLoaded ? (
          <button
            type="button"
            aria-pressed={doubleSided}
            onClick={onToggleDoubleSided}
            className={toolbarToggleClass(doubleSided)}
          >
            <Layers className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Double-sided</span>
          </button>
        ) : null}
        <button
          type="button"
          disabled={!sourceLoaded || !modelReady || isPlacementMode}
          onClick={() => void returnToOverview()}
          className={`${toolbarToggleClass(false)} disabled:cursor-not-allowed disabled:opacity-35`}
        >
          <Maximize2 className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Overview</span>
        </button>
        <button
          type="button"
          aria-pressed={sectionEnabled}
          disabled={!sourceLoaded || !modelReady}
          onClick={onToggleSection}
          className={`${toolbarToggleClass(sectionEnabled)} disabled:cursor-not-allowed disabled:opacity-35`}
        >
          <Slice className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Section</span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {hasPublished && unsavedChanges ? (
          <span className="rounded border border-[#c45c4a]/40 bg-[#c45c4a]/15 px-2 py-1 text-[10px] tracking-[0.12em] text-[#f3d6d6] uppercase">
            <span className="sm:hidden">Unsaved</span>
            <span className="hidden sm:inline">Unsaved changes</span>
          </span>
        ) : null}
        <button
          type="button"
          disabled={
            !sourceLoaded ||
            !modelReady ||
            isPlacementMode ||
            isGeneratingTemplate
          }
          onClick={onGenerateTemplate}
          className={`${toolbarToggleClass(false)} disabled:cursor-not-allowed disabled:opacity-35`}
        >
          <Sparkles className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Generate Template Tour</span>
          <span className="sm:hidden">Template</span>
        </button>
        <button
          type="button"
          disabled={!sourceLoaded || !modelReady || isPlacementMode}
          onClick={onPublish}
          className={accentButtonClass(
            !sourceLoaded || !modelReady || isPlacementMode,
          )}
        >
          <Share2 className="size-3.5" aria-hidden />
          <span className="hidden lg:inline">
            {hasPublished ? "Save & Update" : "Publish Tour"}
          </span>
          <span className="lg:hidden">{hasPublished ? "Update" : "Publish"}</span>
        </button>
        <button
          type="button"
          aria-pressed={leftOpen}
          onClick={onToggleLeft}
          className={`${toolbarToggleClass(leftOpen)} lg:hidden`}
          aria-label="Toggle start view"
        >
          <PanelLeft className="size-3.5" />
        </button>
        <button
          type="button"
          aria-pressed={rightOpen}
          onClick={onToggleRight}
          className={`${toolbarToggleClass(rightOpen)} lg:hidden`}
          aria-label="Toggle inspector"
        >
          <PanelRight className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={!startView || isPlacementMode || !modelReady}
          onClick={() => void enterExploreFromEditor()}
          className={`${toolbarToggleClass(false)} disabled:cursor-not-allowed disabled:opacity-35`}
        >
          <Play className="size-3.5" aria-hidden />
          Preview Exploration
        </button>
        <button
          type="button"
          onClick={onLoadGlb}
          className={toolbarToggleClass(false)}
        >
          <FolderOpen className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Load GLB</span>
        </button>
        {sourceLoaded ? (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((value) => !value)}
              className={toolbarToggleClass(menuOpen)}
              aria-label="Model menu"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute top-full right-0 z-50 mt-1 min-w-40 rounded border border-white/10 bg-[#1a1c20] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onRemoveModel();
                  }}
                  className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-[12px] text-[#c8c4bc] hover:bg-white/8 hover:text-[#efece6]"
                >
                  <Trash2 className="size-3.5" />
                  Remove model
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
