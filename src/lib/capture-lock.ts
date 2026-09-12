type Listener = (locked: boolean) => void;

let locked = false;
const listeners = new Set<Listener>();

export function isCaptureLocked() {
  return locked;
}

export function areHelpersHiddenForCapture() {
  return locked;
}

export function setCaptureLocked(next: boolean) {
  if (locked === next) return;
  locked = next;
  for (const listener of listeners) listener(locked);
}

export function subscribeCaptureLock(listener: Listener) {
  listeners.add(listener);
  listener(locked);
  return () => {
    listeners.delete(listener);
  };
}
