import { describe, expect, it } from "vitest";
import {
  buildGenerationPrompt,
  capturePixelSize,
  openaiImageSize,
  resolveAiVisualizationSettings,
  sanitizeVisitorInstruction,
  ARCHITECTURAL_PRESERVATION_PROMPT,
} from "./ai-visualization";
import { parsePublishedTourData } from "./tour-schema";

describe("AI visualization helpers", () => {
  it("keeps capture dimensions divisible by 16 and preserves aspect", () => {
    const landscape = capturePixelSize(16 / 9);
    expect(landscape.width % 16).toBe(0);
    expect(landscape.height % 16).toBe(0);
    expect(landscape.width).toBe(1536);
    expect(landscape.height).toBe(864);
    expect(landscape.width / landscape.height).toBeCloseTo(16 / 9, 2);

    const portrait = capturePixelSize(9 / 16);
    expect(portrait.width % 16).toBe(0);
    expect(portrait.height % 16).toBe(0);
    expect(portrait.height).toBe(1536);
  });

  it("maps an OpenAI size string from the same rounding rules", () => {
    expect(openaiImageSize(1920, 1080)).toBe("1536x864");
  });

  it("clamps visitor instructions and keeps the preservation prompt", () => {
    const long = "x".repeat(800);
    expect(sanitizeVisitorInstruction(long)).toHaveLength(500);
    const prompt = buildGenerationPrompt("Use warm oak flooring.");
    expect(prompt.startsWith(ARCHITECTURAL_PRESERVATION_PROMPT)).toBe(true);
    expect(prompt).toContain("Use warm oak flooring.");
    expect(prompt).toContain("do not allow this to change geometry");
  });

  it("defaults AI Visualization on for existing published tours", () => {
    const parsed = parsePublishedTourData({
      schemaVersion: 1,
      model: {
        url: "/models/colored-house.glb",
        filename: "house.glb",
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        bounds: { min: [-5, 0, -5], max: [5, 4, 5] },
      },
      startView: {
        id: "start",
        name: "Entrance",
        position: [0, 1.6, 4],
        quaternion: [0, 0, 0, 1],
        target: [0, 1.6, 0],
        fov: 46,
      },
    });
    expect(parsed.aiVisualization.enabled).toBe(true);
    expect(parsed.aiVisualization.maxInitialPerHour).toBe(6);
    expect(parsed.aiVisualization.maxFollowUps).toBe(10);
  });

  it("doubles the old hosted limits and leaves custom values alone", () => {
    expect(resolveAiVisualizationSettings({ enabled: true }).maxInitialPerHour).toBe(6);
    expect(resolveAiVisualizationSettings({ enabled: true }).maxFollowUps).toBe(10);
    expect(
      resolveAiVisualizationSettings({
        enabled: true,
        maxInitialPerHour: 3,
        maxFollowUps: 5,
      }),
    ).toMatchObject({ maxInitialPerHour: 6, maxFollowUps: 10 });
    expect(
      resolveAiVisualizationSettings({
        enabled: true,
        maxInitialPerHour: 8,
        maxFollowUps: 4,
      }),
    ).toMatchObject({ maxInitialPerHour: 8, maxFollowUps: 4 });
  });
});
