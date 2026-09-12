export type EnvLoadState = "loading" | "ready" | "error";

type Listener = (state: EnvLoadState) => void;

let current: EnvLoadState = "loading";
let generation = 0;
const listeners = new Set<Listener>();

export function getEnvLoadState() {
  return current;
}

export function setEnvLoadState(state: EnvLoadState) {
  current = state;
  for (const listener of listeners) listener(current);
}

export function beginEnvLoad() {
  generation += 1;
  setEnvLoadState("loading");
  return generation;
}

export function currentEnvGeneration() {
  return generation;
}

export function subscribeEnvLoadState(listener: Listener) {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
