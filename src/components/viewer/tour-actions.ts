"use client";

import { getEditorCamera } from "./editor-camera";
import {
  isLockedMode,
  selectCurrentViewpoints,
  selectStartViewpoint,
  selectStartViewpointId,
  useTourStore,
} from "@/store/tour-store";
import { requestCancelExploration } from "@/lib/exploration-session";

export function addViewpointFromEditor() {
  const state = useTourStore.getState();
  if (isLockedMode(state.appMode) || state.isPlacementMode) return null;
  const snapshot = getEditorCamera()?.capture();
  if (!snapshot) return null;
  return state.addViewpoint(snapshot);
}

export function captureStartViewFromEditor() {
  const state = useTourStore.getState();
  if (isLockedMode(state.appMode) || state.isPlacementMode) return null;
  const snapshot = getEditorCamera()?.capture();
  if (!snapshot) return null;
  const start = selectStartViewpoint(state);
  if (start) {
    state.updateViewpoint(start.id, snapshot);
    state.setStartViewpointId(start.id);
    return start;
  }
  const created = state.addViewpoint(snapshot);
  if (created) state.setStartViewpointId(created.id);
  return created;
}

export function togglePlacementMode() {
  const state = useTourStore.getState();
  if (isLockedMode(state.appMode)) return;
  if (state.isPlacementMode) {
    state.cancelPlacement();
    return;
  }
  state.enterPlacementMode(true);
}

export async function enterTour(viewpointId: string) {
  await getEditorCamera()?.enterTour(viewpointId);
}

export async function enterTourFromEditor(viewpointId?: string | null) {
  const state = useTourStore.getState();
  const viewpoints = selectCurrentViewpoints(state);
  const id =
    viewpointId ??
    (state.selectedId && viewpoints.some((item) => item.id === state.selectedId)
      ? state.selectedId
      : viewpoints[0]?.id);
  if (!id) return;
  await enterTour(id);
}

export async function enterExploreFromEditor() {
  const state = useTourStore.getState();
  if (!selectStartViewpointId(state)) return;
  await getEditorCamera()?.enterExplore();
}

export async function exitExploreFromEditor() {
  requestCancelExploration();
  await getEditorCamera()?.exitTour();
}

export async function goToTourViewpoint(viewpointId: string) {
  await getEditorCamera()?.goToTourViewpoint(viewpointId);
}

export async function exitTour() {
  await getEditorCamera()?.exitTour();
}

export async function returnToOverview() {
  await getEditorCamera()?.frameOverview(true);
}

export function updateViewpointFromEditor(id: string) {
  const state = useTourStore.getState();
  if (isLockedMode(state.appMode)) return;
  const snapshot = getEditorCamera()?.capture();
  if (!snapshot) return;
  state.updateViewpoint(id, snapshot);
}
