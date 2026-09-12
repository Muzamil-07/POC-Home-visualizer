import {
  fetchCuratedHouseTour,
  looksLikeCuratedViewpoints,
} from "@/lib/curated-tour";
import { isDefaultHouseModelId } from "@/lib/house-model";
import {
  selectCurrentViewpoints,
  useTourStore,
} from "@/store/tour-store";

export async function maybeApplyCuratedTour(force = false) {
  const state = useTourStore.getState();
  if (!isDefaultHouseModelId(state.modelId)) return false;
  if (state.appMode !== "edit") return false;

  const viewpoints = selectCurrentViewpoints(state);
  const hasOverride = Boolean(
    state.modelId && state.localTourOverrideByModel[state.modelId],
  );

  if (!force) {
    if (hasOverride) return false;
    if (viewpoints.length > 0 && !looksLikeCuratedViewpoints(viewpoints)) {
      return false;
    }
  }

  const tour = await fetchCuratedHouseTour();
  if (!tour) return false;

  useTourStore.getState().applyCuratedTour(tour);
  return true;
}

export async function resetToCuratedTour() {
  const state = useTourStore.getState();
  if (state.appMode !== "edit") return false;
  if (!isDefaultHouseModelId(state.modelId)) return false;
  if (
    selectCurrentViewpoints(state).length > 0 &&
    !window.confirm(
      "Discard local viewpoint edits and reload the bundled curated tour?",
    )
  ) {
    return false;
  }

  const tour = await fetchCuratedHouseTour();
  if (!tour) {
    useTourStore
      .getState()
      .setTemplateNotice(
        "Couldn't load the curated tour JSON. Confirm public/tours/curated-house-tour.json is present.",
      );
    return false;
  }

  useTourStore.getState().applyCuratedTour(tour);
  useTourStore.getState().setTemplateNotice("Curated tour restored.");
  return true;
}

export async function loadCuratedTourAction() {
  const state = useTourStore.getState();
  if (state.appMode !== "edit") return false;
  if (
    selectCurrentViewpoints(state).length > 0 &&
    !window.confirm(
      "Replace the current viewpoints with the bundled curated tour?",
    )
  ) {
    return false;
  }

  const tour = await fetchCuratedHouseTour();
  if (!tour) {
    useTourStore
      .getState()
      .setTemplateNotice(
        "Couldn't load the curated tour JSON. Confirm public/tours/curated-house-tour.json is present.",
      );
    return false;
  }

  useTourStore.getState().applyCuratedTour(tour);
  useTourStore.getState().setTemplateNotice("Curated tour loaded.");
  return true;
}
