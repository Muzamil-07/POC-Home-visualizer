export type ModelLoadProgress = {
  message: string;
  ratio: number | null;
};

type Listener = (progress: ModelLoadProgress | null) => void;

let current: ModelLoadProgress | null = null;
const listeners = new Set<Listener>();

export function setModelLoadProgress(progress: ModelLoadProgress | null) {
  current = progress;
  for (const listener of listeners) listener(current);
}

export function getModelLoadProgress() {
  return current;
}

export function subscribeModelLoadProgress(listener: Listener) {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
