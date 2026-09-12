export type ExplorationHintKind =
  | "idle"
  | "far"
  | "blocked"
  | "tight"
  | "stairs"
  | "invalid"
  | null;

type ExplorationUi = {
  fade: number;
  hint: string | null;
  status: ExplorationHintKind;
  helpOpen: boolean;
  arrivedOnce: boolean;
};

type Listener = (state: ExplorationUi) => void;

const idleHintMouse = "Click a floor to move · Drag to look around";
const idleHintTouch = "Tap a floor to move · Drag to look around";

let current: ExplorationUi = {
  fade: 1,
  hint: idleHintMouse,
  status: "idle",
  helpOpen: false,
  arrivedOnce: false,
};

const listeners = new Set<Listener>();

export function explorationIdleHint(touch: boolean) {
  return touch ? idleHintTouch : idleHintMouse;
}

export function getExplorationUi() {
  return current;
}

export function subscribeExplorationUi(listener: Listener) {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export function setExplorationUi(patch: Partial<ExplorationUi>) {
  current = { ...current, ...patch };
  for (const listener of listeners) listener(current);
}

export function resetExplorationUi(touch = false) {
  current = {
    fade: 1,
    hint: explorationIdleHint(touch),
    status: "idle",
    helpOpen: false,
    arrivedOnce: false,
  };
  for (const listener of listeners) listener(current);
}
