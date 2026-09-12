"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type PublishedEditorRecord = {
  tourId: string;
  slug: string;
  editToken: string;
  shareUrl: string;
  lastPublishedAt: string;
  lastPublishedSnapshotHash: string;
  title: string;
  autoplayEnabled: boolean;
  dwellTime: number;
  startViewpointId: string;
  aiVisualizationEnabled?: boolean;
};

type PublishState = {
  recordsByModel: Record<string, PublishedEditorRecord>;
  getRecord: (modelId: string | null) => PublishedEditorRecord | null;
  saveRecord: (modelId: string, record: PublishedEditorRecord) => void;
  clearRecord: (modelId: string) => void;
};

export const usePublishStore = create<PublishState>()(
  persist(
    (set, get) => ({
      recordsByModel: {},
      getRecord: (modelId) => {
        if (!modelId) return null;
        return get().recordsByModel[modelId] ?? null;
      },
      saveRecord: (modelId, record) =>
        set({
          recordsByModel: {
            ...get().recordsByModel,
            [modelId]: record,
          },
        }),
      clearRecord: (modelId) => {
        const next = { ...get().recordsByModel };
        delete next[modelId];
        set({ recordsByModel: next });
      },
    }),
    {
      name: "architectural-tour-publish",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        recordsByModel: state.recordsByModel,
      }),
      skipHydration: true,
    },
  ),
);
