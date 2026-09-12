import { describe, expect, it } from "vitest";
import {
  fallbackSiteGradeY,
  groundPlaneY,
  groundSize,
  groundSliderRange,
  pickDominantGrade,
} from "./ground";

describe("site grade helpers", () => {
  it("places surrounding ground at the model bottom", () => {
    expect(fallbackSiteGradeY(0, 12)).toBeCloseTo(0);
  });

  it("picks the strongest landscape bin and ignores the absolute bottom", () => {
    const bins = new Map<number, number>([
      [0, 80],
      [0.08, 10],
      [4.96, 40],
      [5.04, 120],
      [9.6, 30],
    ]);
    expect(pickDominantGrade(bins, 0, 12)).toBeCloseTo(5.04);
  });

  it("expands the slider when the detected grade is above 35% of height", () => {
    const range = groundSliderRange(0, 12, 5.1);
    expect(range.min).toBe(0);
    expect(range.max).toBeGreaterThanOrEqual(5.1);
  });

  it("sizes the surrounding plane from the model span", () => {
    expect(groundSize(46, 39, 15)).toBe(46 * 15);
    expect(groundPlaneY(5, 12)).toBeCloseTo(5 - Math.max(0.01, 0.012));
  });
});
