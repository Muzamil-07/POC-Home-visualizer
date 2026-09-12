import { Box3, Object3D } from "three";

export type GroundSettings = {
  enabled: true;
  siteGradeY: number;
  sizeMultiplier: number;
  color: string;
};

export const DEFAULT_GROUND_COLOR = "#6f8052";
export const DEFAULT_GROUND_SIZE_MULTIPLIER = 15;

export const GROUND_COLOR_PRESETS = [
  { id: "lawn", label: "Lawn", color: "#6f8052" },
  { id: "field", label: "Field", color: "#7d8b4e" },
  { id: "earth", label: "Earth", color: "#8a7a58" },
] as const;

const IGNORE_BOTTOM_FRACTION = 0.025;

export function fallbackSiteGradeY(minY: number, height: number) {
  void height;
  return minY;
}

export function defaultGroundSettings(minY: number, height: number): GroundSettings {
  return {
    enabled: true,
    siteGradeY: fallbackSiteGradeY(minY, height),
    sizeMultiplier: DEFAULT_GROUND_SIZE_MULTIPLIER,
    color: DEFAULT_GROUND_COLOR,
  };
}

export function groundSliderRange(
  minY: number,
  height: number,
  detectedY?: number,
  currentY?: number,
) {
  const specMax = minY + height * 0.35;
  const max = Math.max(
    specMax,
    detectedY ?? specMax,
    currentY ?? specMax,
    minY + height * 0.08,
  );
  return { min: minY, max };
}

export function pickDominantGrade(
  bins: Map<number, number>,
  minY: number,
  height: number,
) {
  const ignoreBelow = minY + height * IGNORE_BOTTOM_FRACTION;
  let bestY = fallbackSiteGradeY(minY, height);
  let bestWeight = 0;
  for (const [y, weight] of bins) {
    if (y < ignoreBelow) continue;
    if (weight > bestWeight) {
      bestWeight = weight;
      bestY = y;
    }
  }
  return bestY;
}

export function detectSiteGrade(
  root: Object3D,
  size?: { height: number },
): number {
  void size;
  const worldBox = new Box3().setFromObject(root);
  return worldBox.isEmpty() ? 0 : worldBox.min.y;
}

export function groundPlaneY(siteGradeY: number, modelHeight: number) {
  return siteGradeY - Math.max(0.01, modelHeight * 0.001);
}

export function groundSize(width: number, depth: number, multiplier: number) {
  return Math.max(width, depth, 4) * multiplier;
}
