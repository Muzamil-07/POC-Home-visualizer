import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  clampEyeHeight,
  clampFov,
  createModelIdentity,
  idleSectionState,
  nextViewpointName,
  sortViewpoints,
  DEFAULT_EYE_HEIGHT,
  DEFAULT_FOV,
  type AppMode,
  type EditorCameraSnapshot,
  type ModelIdentityInput,
  type SectionBounds,
  type SectionState,
  type TourViewpoint,
  type TransformMode,
  type Vector3Tuple,
  type ViewpointPlacementDraft,
} from "@/types/tour";
import {
  clampSectionHeight,
  defaultSectionHeight,
} from "@/components/viewer/section";
import { applyEyeHeightToDraft } from "@/components/viewer/placement";
import type { CuratedHouseTour } from "@/types/curated-tour";
import { viewpointsFromCuratedTour } from "@/lib/curated-tour";
import type { GroundSettings } from "@/lib/ground";

type PersistedTourState = {
  viewpointsByModel: Record<string, TourViewpoint[]>;
  localTourOverrideByModel: Record<string, boolean>;
  groundByModel: Record<string, GroundSettings>;
  startViewpointIdByModel: Record<string, string>;
};

type TourState = PersistedTourState & {
  modelId: string | null;
  selectedId: string | null;
  transformMode: TransformMode;
  inspectorOpen: boolean;
  editorFov: number;
  appMode: AppMode;
  activeTourViewpointId: string | null;
  isTourTransitioning: boolean;
  isExitingTour: boolean;
  editorCameraSnapshot: EditorCameraSnapshot | null;
  isPlacementMode: boolean;
  placementAssignStart: boolean;
  placementDraft: ViewpointPlacementDraft | null;
  hoveredSurfacePoint: Vector3Tuple | null;
  isHoveredSurfaceValid: boolean;
  eyeHeight: number;
  placementNotice: string | null;
  placementNoticeId: number;
  isGeneratingTemplate: boolean;
  generationProgress: string | null;
  templateNotice: string | null;
  templateUndoList: TourViewpoint[] | null;
  section: SectionState;
  sectionInitialized: boolean;
  detectedSiteGrade: number | null;
  setCurrentModel: (identity: ModelIdentityInput | null) => void;
  addViewpoint: (snapshot: EditorCameraSnapshot) => TourViewpoint | null;
  updateViewpoint: (id: string, patch: Partial<TourViewpoint>) => void;
  deleteViewpoint: (id: string) => void;
  selectViewpoint: (id: string | null) => void;
  reorderViewpoint: (id: string, direction: "up" | "down") => void;
  clearViewpoints: () => void;
  setTransformMode: (mode: TransformMode) => void;
  setInspectorOpen: (open: boolean) => void;
  setEditorFov: (fov: number) => void;
  enterTourMode: (
    viewpointId: string,
    snapshot: EditorCameraSnapshot | null,
  ) => void;
  setActiveTourViewpoint: (id: string | null) => void;
  setTourTransitioning: (value: boolean) => void;
  beginExitTour: () => void;
  finishExitTour: () => void;
  enterPlacementMode: (assignStart?: boolean) => void;
  cancelPlacement: () => void;
  confirmPlacement: () => TourViewpoint | null;
  setPlacementDraft: (draft: ViewpointPlacementDraft | null) => void;
  setPlacementHover: (
    point: Vector3Tuple | null,
    valid: boolean,
  ) => void;
  setEyeHeight: (value: number) => void;
  showPlacementNotice: (message: string) => void;
  clearPlacementNotice: () => void;
  setTemplateGeneration: (generating: boolean, progress?: string | null) => void;
  applyGeneratedViewpoints: (
    viewpoints: TourViewpoint[],
    behavior: "replace" | "append",
  ) => TourViewpoint | null;
  undoTemplateGeneration: () => boolean;
  setTemplateNotice: (message: string | null) => void;
  initSectionForModel: (bounds: SectionBounds) => void;
  toggleSection: (bounds: SectionBounds) => void;
  setSectionEnabled: (enabled: boolean, bounds: SectionBounds) => void;
  setSectionHeight: (height: number, bounds: SectionBounds) => void;
  setSectionShowPlane: (showPlane: boolean) => void;
  resetSection: (bounds: SectionBounds) => void;
  setDetectedSiteGrade: (value: number) => void;
  setGroundSettings: (patch: Partial<GroundSettings>) => void;
  resetGroundToDetected: (fallback: GroundSettings) => void;
  tourFade: number;
  applyCuratedTour: (tour: CuratedHouseTour) => void;
  setStartViewpointId: (id: string | null) => void;
  enterExploreMode: (snapshot: EditorCameraSnapshot | null) => void;
};

function nowIso() {
  return new Date().toISOString();
}

function cloneViewpoints(list: TourViewpoint[]) {
  return list.map((viewpoint) => ({ ...viewpoint }));
}

const EMPTY_VIEWPOINTS: TourViewpoint[] = [];

function currentList(state: Pick<TourState, "modelId" | "viewpointsByModel">) {
  if (!state.modelId) return EMPTY_VIEWPOINTS;
  return state.viewpointsByModel[state.modelId] ?? EMPTY_VIEWPOINTS;
}

function writeList(
  state: TourState,
  list: TourViewpoint[],
): Pick<TourState, "viewpointsByModel"> {
  if (!state.modelId) return { viewpointsByModel: state.viewpointsByModel };
  return {
    viewpointsByModel: {
      ...state.viewpointsByModel,
      [state.modelId]: sortViewpoints(
        list.map((viewpoint, index) => ({ ...viewpoint, order: index })),
      ),
    },
  };
}

function idlePlacementState() {
  return {
    isPlacementMode: false,
    placementDraft: null,
    hoveredSurfacePoint: null,
    isHoveredSurfaceValid: false,
    placementNotice: null,
    placementAssignStart: false,
  };
}

function idleTourState() {
  return {
    appMode: "edit" as const,
    activeTourViewpointId: null,
    isTourTransitioning: false,
    isExitingTour: false,
    editorCameraSnapshot: null,
  };
}

export function isLockedMode(mode: AppMode) {
  return mode === "tour" || mode === "explore";
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      viewpointsByModel: {},
      localTourOverrideByModel: {},
      groundByModel: {},
      startViewpointIdByModel: {},
      tourFade: 0,
      modelId: null,
      selectedId: null,
      transformMode: "translate",
      inspectorOpen: false,
      editorFov: DEFAULT_FOV,
      appMode: "edit",
      activeTourViewpointId: null,
      isTourTransitioning: false,
      isExitingTour: false,
      editorCameraSnapshot: null,
      isPlacementMode: false,
      placementAssignStart: false,
      placementDraft: null,
      hoveredSurfacePoint: null,
      isHoveredSurfaceValid: false,
      eyeHeight: DEFAULT_EYE_HEIGHT,
      placementNotice: null,
      placementNoticeId: 0,
      isGeneratingTemplate: false,
      generationProgress: null,
      templateNotice: null,
      templateUndoList: null,
      section: idleSectionState(),
      sectionInitialized: false,
      detectedSiteGrade: null,

      setCurrentModel: (identity) => {
        const modelId = identity ? createModelIdentity(identity) : null;
        set({
          modelId,
          selectedId: null,
          inspectorOpen: false,
          isGeneratingTemplate: false,
          generationProgress: null,
          templateNotice: null,
          templateUndoList: null,
          section: idleSectionState(),
          sectionInitialized: false,
          detectedSiteGrade: null,
          ...idleTourState(),
          ...idlePlacementState(),
        });
      },

      addViewpoint: (snapshot) => {
        const state = get();
        if (!state.modelId || isLockedMode(state.appMode)) return null;

        const list = currentList(state);
        const timestamp = nowIso();
        const viewpoint: TourViewpoint = {
          id: crypto.randomUUID(),
          name: nextViewpointName(list),
          description: "",
          position: snapshot.position,
          quaternion: snapshot.quaternion,
          target: snapshot.target,
          fov: clampFov(snapshot.fov),
          order: list.length,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const hasStart = selectStartViewpointId(state) !== null;

        set({
          ...writeList(state, [...list, viewpoint]),
          selectedId: viewpoint.id,
          inspectorOpen: true,
          templateUndoList: null,
          ...(hasStart
            ? {}
            : {
                startViewpointIdByModel: {
                  ...state.startViewpointIdByModel,
                  [state.modelId]: viewpoint.id,
                },
              }),
        });
        return viewpoint;
      },

      updateViewpoint: (id, patch) => {
        const state = get();
        if (isLockedMode(state.appMode)) return;
        const list = currentList(state);
        const next = list.map((viewpoint) => {
          if (viewpoint.id !== id) return viewpoint;
          const fov =
            patch.fov === undefined ? viewpoint.fov : clampFov(patch.fov);
          return {
            ...viewpoint,
            ...patch,
            fov,
            updatedAt: nowIso(),
          };
        });
        set(writeList(state, next));
      },

      deleteViewpoint: (id) => {
        const state = get();
        if (isLockedMode(state.appMode)) return;
        const next = currentList(state).filter((viewpoint) => viewpoint.id !== id);
        const startId = state.modelId
          ? state.startViewpointIdByModel[state.modelId]
          : undefined;
        set({
          ...writeList(state, next),
          selectedId: state.selectedId === id ? null : state.selectedId,
          inspectorOpen:
            state.selectedId === id ? false : state.inspectorOpen,
          templateUndoList: null,
          ...(state.modelId && startId === id
            ? {
                startViewpointIdByModel: {
                  ...state.startViewpointIdByModel,
                  [state.modelId]: "",
                },
              }
            : {}),
        });
      },

      selectViewpoint: (id) => {
        if (isLockedMode(get().appMode) || get().isPlacementMode) return;
        set({
          selectedId: id,
          inspectorOpen: id !== null,
        });
      },

      reorderViewpoint: (id, direction) => {
        const state = get();
        if (isLockedMode(state.appMode)) return;
        const list = currentList(state);
        const index = list.findIndex((viewpoint) => viewpoint.id === id);
        if (index < 0) return;
        const swapWith = direction === "up" ? index - 1 : index + 1;
        if (swapWith < 0 || swapWith >= list.length) return;
        const next = [...list];
        const current = next[index];
        const other = next[swapWith];
        if (!current || !other) return;
        next[index] = other;
        next[swapWith] = current;
        set({
          ...writeList(state, next),
          templateUndoList: null,
        });
      },

      clearViewpoints: () => {
        const state = get();
        if (!state.modelId || isLockedMode(state.appMode)) return;
        set({
          viewpointsByModel: {
            ...state.viewpointsByModel,
            [state.modelId]: [],
          },
          startViewpointIdByModel: {
            ...state.startViewpointIdByModel,
            [state.modelId]: "",
          },
          selectedId: null,
          inspectorOpen: false,
          templateUndoList: null,
        });
      },

      setTransformMode: (mode) => set({ transformMode: mode }),
      setInspectorOpen: (open) => set({ inspectorOpen: open }),
      setEditorFov: (fov) => set({ editorFov: clampFov(fov) }),

      enterTourMode: (viewpointId, snapshot) => {
        const state = get();
        const alreadyInTour = state.appMode === "tour";
        set({
          ...idlePlacementState(),
          appMode: "tour",
          selectedId: viewpointId,
          inspectorOpen: false,
          isExitingTour: false,
          isTourTransitioning: true,
          activeTourViewpointId: viewpointId,
          editorCameraSnapshot: alreadyInTour
            ? state.editorCameraSnapshot
            : snapshot,
        });
      },

      setActiveTourViewpoint: (id) =>
        set({
          activeTourViewpointId: id,
          selectedId: id ?? get().selectedId,
        }),
      setTourTransitioning: (value) => set({ isTourTransitioning: value }),

      beginExitTour: () =>
        set({
          appMode: "edit",
          isExitingTour: true,
          isTourTransitioning: false,
        }),

      finishExitTour: () =>
        set({
          isExitingTour: false,
          activeTourViewpointId: null,
          isTourTransitioning: false,
          editorCameraSnapshot: null,
        }),

      enterExploreMode: (snapshot) => {
        const state = get();
        const alreadyExploring = state.appMode === "explore";
        set({
          ...idlePlacementState(),
          appMode: "explore",
          inspectorOpen: false,
          isExitingTour: false,
          isTourTransitioning: false,
          editorCameraSnapshot: alreadyExploring
            ? state.editorCameraSnapshot
            : snapshot,
        });
      },

      setStartViewpointId: (id) => {
        const state = get();
        if (!state.modelId || isLockedMode(state.appMode)) return;
        set({
          startViewpointIdByModel: {
            ...state.startViewpointIdByModel,
            [state.modelId]: id ?? "",
          },
          selectedId: id || state.selectedId,
          inspectorOpen: Boolean(id) || state.inspectorOpen,
        });
      },

      enterPlacementMode: (assignStart = true) => {
        const state = get();
        if (!state.modelId || isLockedMode(state.appMode)) return;
        set({
          isPlacementMode: true,
          placementAssignStart: assignStart,
          placementDraft: null,
          hoveredSurfacePoint: null,
          isHoveredSurfaceValid: false,
          eyeHeight: DEFAULT_EYE_HEIGHT,
          selectedId: null,
          inspectorOpen: false,
          placementNotice: null,
        });
      },

      cancelPlacement: () => {
        const state = get();
        if (!state.isPlacementMode && !state.placementDraft) return;
        set(idlePlacementState());
      },

      confirmPlacement: () => {
        const state = get();
        const draft = state.placementDraft;
        if (
          !draft ||
          !state.isPlacementMode ||
          !state.modelId ||
          isLockedMode(state.appMode)
        ) {
          return null;
        }

        const assignStart = state.placementAssignStart;
        set(idlePlacementState());
        const created = get().addViewpoint({
          position: draft.position,
          quaternion: draft.quaternion,
          target: draft.target,
          fov: clampFov(state.editorFov),
        });
        if (created && assignStart) {
          get().setStartViewpointId(created.id);
        }
        return created;
      },

      setPlacementDraft: (draft) => set({ placementDraft: draft }),
      setPlacementHover: (point, valid) => {
        const state = get();
        const previous = state.hoveredSurfacePoint;
        if (
          previous &&
          point &&
          previous[0] === point[0] &&
          previous[1] === point[1] &&
          previous[2] === point[2] &&
          state.isHoveredSurfaceValid === valid
        ) {
          return;
        }
        if (!previous && !point && state.isHoveredSurfaceValid === valid) {
          return;
        }
        set({
          hoveredSurfacePoint: point,
          isHoveredSurfaceValid: valid,
        });
      },
      setEyeHeight: (value) => {
        const eyeHeight = clampEyeHeight(value);
        const draft = get().placementDraft;
        set({
          eyeHeight,
          placementDraft: draft
            ? applyEyeHeightToDraft(draft, eyeHeight)
            : draft,
        });
      },
      showPlacementNotice: (message) =>
        set({
          placementNotice: message,
          placementNoticeId: get().placementNoticeId + 1,
        }),
      clearPlacementNotice: () => set({ placementNotice: null }),

      setTemplateGeneration: (generating, progress = null) =>
        set({
          isGeneratingTemplate: generating,
          generationProgress: generating ? progress : null,
        }),

      applyGeneratedViewpoints: (viewpoints, behavior) => {
        const state = get();
        if (!state.modelId || isLockedMode(state.appMode)) return null;
        if (viewpoints.length === 0) return null;

        const previous = cloneViewpoints(currentList(state));
        const timestamp = nowIso();
        const prepared = viewpoints.map((viewpoint, index) => ({
          ...viewpoint,
          id: viewpoint.id || crypto.randomUUID(),
          createdAt: viewpoint.createdAt || timestamp,
          updatedAt: timestamp,
          order: index,
        }));
        const next =
          behavior === "append" ? [...previous, ...prepared] : prepared;
        const selected = prepared[0];
        if (!selected) return null;

        set({
          ...writeList(state, next),
          selectedId: selected.id,
          inspectorOpen: true,
          templateUndoList: previous,
          ...(selectStartViewpointId(state)
            ? {}
            : {
                startViewpointIdByModel: {
                  ...state.startViewpointIdByModel,
                  [state.modelId]: selected.id,
                },
              }),
        });
        return selected;
      },

      undoTemplateGeneration: () => {
        const state = get();
        if (!state.modelId || !state.templateUndoList) return false;
        const restored = cloneViewpoints(state.templateUndoList);
        set({
          ...writeList(state, restored),
          selectedId: restored[0]?.id ?? null,
          inspectorOpen: Boolean(restored[0]),
          templateUndoList: null,
          templateNotice: "Template generation undone.",
        });
        return true;
      },

      setTemplateNotice: (message) => set({ templateNotice: message }),

      initSectionForModel: (bounds) => {
        const state = get();
        if (state.sectionInitialized) return;
        set({
          sectionInitialized: true,
          section: {
            ...state.section,
            height: defaultSectionHeight(bounds),
          },
        });
      },

      toggleSection: (bounds) => {
        const state = get();
        get().setSectionEnabled(!state.section.enabled, bounds);
      },

      setSectionEnabled: (enabled, bounds) => {
        const state = get();
        const height = state.sectionInitialized
          ? clampSectionHeight(state.section.height, bounds)
          : defaultSectionHeight(bounds);
        set({
          sectionInitialized: true,
          section: {
            ...state.section,
            enabled,
            height,
          },
        });
      },

      setSectionHeight: (height, bounds) => {
        const nextHeight = clampSectionHeight(height, bounds);
        const state = get();
        if (state.section.height === nextHeight) return;
        set({
          section: {
            ...state.section,
            height: nextHeight,
          },
          placementDraft: null,
          hoveredSurfacePoint: null,
          isHoveredSurfaceValid: false,
        });
      },

      setSectionShowPlane: (showPlane) =>
        set({
          section: {
            ...get().section,
            showPlane,
          },
        }),

      resetSection: (bounds) =>
        set({
          sectionInitialized: true,
          section: {
            enabled: false,
            height: defaultSectionHeight(bounds),
            showPlane: true,
          },
          placementDraft: null,
          hoveredSurfacePoint: null,
          isHoveredSurfaceValid: false,
        }),

      setDetectedSiteGrade: (value) => set({ detectedSiteGrade: value }),
      setGroundSettings: (patch) => {
        const state = get();
        if (!state.modelId) return;
        const current =
          state.groundByModel[state.modelId] ??
          ({
            enabled: true,
            siteGradeY: state.detectedSiteGrade ?? 0,
            sizeMultiplier: 15,
            color: "#6f8052",
          } satisfies GroundSettings);
        set({
          groundByModel: {
            ...state.groundByModel,
            [state.modelId]: { ...current, ...patch, enabled: true },
          },
        });
      },
      resetGroundToDetected: (fallback) => {
        const state = get();
        if (!state.modelId) return;
        set({
          groundByModel: {
            ...state.groundByModel,
            [state.modelId]: {
              ...fallback,
              enabled: true,
              siteGradeY: state.detectedSiteGrade ?? fallback.siteGradeY,
            },
          },
        });
      },

      applyCuratedTour: (tour) => {
        const state = get();
        if (!state.modelId || isLockedMode(state.appMode)) return;
        const next = viewpointsFromCuratedTour(tour, nowIso());
        set({
          ...writeList(state, next),
          selectedId: next[0]?.id ?? null,
          inspectorOpen: Boolean(next[0]),
          templateUndoList: null,
          startViewpointIdByModel: {
            ...state.startViewpointIdByModel,
            [state.modelId]: next[0]?.id ?? "",
          },
          localTourOverrideByModel: {
            ...state.localTourOverrideByModel,
            [state.modelId]: false,
          },
        });
      },
    }),
    {
      name: "architectural-tour-viewpoints",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        viewpointsByModel: state.viewpointsByModel,
        localTourOverrideByModel: state.localTourOverrideByModel,
        groundByModel: state.groundByModel,
        startViewpointIdByModel: state.startViewpointIdByModel,
      }),
      skipHydration: true,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedTourState>;
        return {
          ...current,
          ...saved,
          startViewpointIdByModel: {
            ...current.startViewpointIdByModel,
            ...(saved.startViewpointIdByModel ?? {}),
          },
        };
      },
    },
  ),
);

export function selectCurrentViewpoints(state: TourState) {
  return currentList(state);
}

export function selectSelectedViewpoint(state: TourState) {
  if (!state.selectedId) return null;
  return (
    currentList(state).find((viewpoint) => viewpoint.id === state.selectedId) ??
    null
  );
}

export function selectActiveTourViewpoint(state: TourState) {
  if (!state.activeTourViewpointId) return null;
  return (
    currentList(state).find(
      (viewpoint) => viewpoint.id === state.activeTourViewpointId,
    ) ?? null
  );
}

export function selectIsEdit(state: TourState) {
  return state.appMode === "edit";
}

export function selectIsTour(state: TourState) {
  return state.appMode === "tour";
}

export function selectIsExplore(state: TourState) {
  return state.appMode === "explore";
}

export function selectStartViewpointId(state: TourState) {
  if (!state.modelId) return null;
  const list = currentList(state);
  const map = state.startViewpointIdByModel ?? {};
  if (Object.prototype.hasOwnProperty.call(map, state.modelId)) {
    const id = map[state.modelId];
    if (!id) return null;
    return list.some((viewpoint) => viewpoint.id === id) ? id : null;
  }
  return list[0]?.id ?? null;
}

export function selectStartViewpoint(state: TourState) {
  const id = selectStartViewpointId(state);
  if (!id) return null;
  return currentList(state).find((viewpoint) => viewpoint.id === id) ?? null;
}

export function selectCurrentGround(state: TourState) {
  if (!state.modelId) return null;
  return state.groundByModel[state.modelId] ?? null;
}

