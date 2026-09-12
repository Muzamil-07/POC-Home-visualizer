import type { Object3D } from "three";

let glbRoot: Object3D | null = null;

export function registerGlbRoot(root: Object3D | null) {
  glbRoot = root;
}

export function getGlbRoot() {
  return glbRoot;
}
