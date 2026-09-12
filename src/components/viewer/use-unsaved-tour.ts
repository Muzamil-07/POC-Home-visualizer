"use client";

import { useEffect, useState } from "react";
import type { ModelSource, ModelStats } from "./glb";
import {
  buildPublishedTourData,
  hashPublishedSnapshot,
} from "@/lib/build-published-tour";
import {
  selectCurrentViewpoints,
  selectStartViewpointId,
  useTourStore,
} from "@/store/tour-store";
import { usePublishStore } from "@/store/publish-store";

export function useUnsavedPublishedTour(
  source: ModelSource | null,
  stats: ModelStats | null,
) {
  const viewpoints = useTourStore(selectCurrentViewpoints);
  const startViewpointId = useTourStore(selectStartViewpointId);
  const modelId = useTourStore((state) => state.modelId);
  const record = usePublishStore((state) =>
    modelId ? state.recordsByModel[modelId] ?? null : null,
  );
  const ground = useTourStore((state) =>
    modelId ? state.groundByModel[modelId] ?? null : null,
  );
  const [hashDirty, setHashDirty] = useState(false);
  const canCompare = Boolean(record && source && stats && startViewpointId);

  useEffect(() => {
    if (!record || !source || !stats || !startViewpointId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const data = buildPublishedTourData({
            source,
            stats,
            viewpoints,
            startViewpointId,
            ground,
          });
          const hash = await hashPublishedSnapshot(data);
          if (!cancelled) {
            setHashDirty(hash !== record.lastPublishedSnapshotHash);
          }
        } catch {
          if (!cancelled) setHashDirty(true);
        }
      })();
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ground, modelId, record, source, startViewpointId, stats, viewpoints]);

  return {
    record,
    dirty: canCompare && hashDirty,
    hasPublished: Boolean(record),
  };
}
