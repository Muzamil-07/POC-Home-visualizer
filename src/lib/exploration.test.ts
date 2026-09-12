import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  clampNavigation,
  computeIntroPose,
  DEFAULT_NAVIGATION,
  EXPLORATION_WALKABLE_Y,
  isWalkableExplorationNormal,
  movementDuration,
  smootherstep,
  startViewFromViewpoint,
} from "./exploration";

describe("exploration helpers", () => {
  it("keeps navigation defaults in range", () => {
    expect(clampNavigation({})).toEqual(DEFAULT_NAVIGATION);
    expect(clampNavigation({ movementSpeed: 99 }).movementSpeed).toBe(4);
  });

  it("builds an elevated intro behind the start view", () => {
    const start = startViewFromViewpoint({
      id: "start",
      name: "Entrance",
      position: [0, 1.65, 8],
      quaternion: [0, 0, 0, 1],
      target: [0, 1.65, 0],
      fov: 46,
    });
    const intro = computeIntroPose(start, { width: 46, height: 12, depth: 39 });
    expect(intro.introPosition.z).toBeGreaterThan(start.position[2]);
    expect(intro.introPosition.y).toBeGreaterThan(start.position[1]);
  });

  it("treats floors as walkable and walls as not", () => {
    expect(isWalkableExplorationNormal(new Vector3(0, 1, 0))).toBe(true);
    expect(isWalkableExplorationNormal(new Vector3(0, EXPLORATION_WALKABLE_Y, 0))).toBe(
      true,
    );
    expect(isWalkableExplorationNormal(new Vector3(1, 0, 0))).toBe(false);
  });

  it("clamps move duration and eases smoothly", () => {
    expect(movementDuration(1, 2)).toBeCloseTo(0.65);
    expect(movementDuration(40, 2)).toBe(6);
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
    expect(smootherstep(0.5)).toBeCloseTo(0.5);
  });
});
