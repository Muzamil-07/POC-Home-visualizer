import { create } from "zustand";

// Visitor-side color choices for configurable items. Kept in memory only:
// a visitor's picks never change the published tour.
type ConfiguratorState = {
  choices: Record<string, string>;
  openId: string | null;
  hasOpened: boolean;
  hintDismissed: boolean;
  setChoice: (id: string, color: string | null) => void;
  open: (id: string | null) => void;
  dismissHint: () => void;
  reset: () => void;
};

export const useConfiguratorStore = create<ConfiguratorState>()((set) => ({
  choices: {},
  openId: null,
  hasOpened: false,
  hintDismissed: false,
  setChoice: (id, color) =>
    set((state) => {
      const choices = { ...state.choices };
      if (color) choices[id] = color;
      else delete choices[id];
      return { choices };
    }),
  open: (id) =>
    set((state) => ({
      openId: id,
      hasOpened: state.hasOpened || Boolean(id),
    })),
  dismissHint: () => set({ hintDismissed: true }),
  reset: () =>
    set({ choices: {}, openId: null, hasOpened: false, hintDismissed: false }),
}));
