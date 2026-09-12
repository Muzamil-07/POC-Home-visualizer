import { describe, expect, it } from "vitest";
import {
  buildPublishedTourData,
  isPublishableModelUrl,
} from "./build-published-tour";
import type { ModelSource, ModelStats } from "@/components/viewer/glb";
import type { TourViewpoint } from "@/types/tour";

const source: ModelSource = {
  url: "/Lucas%20Home%20-%20Full%20Color%20(2)%20(1).glb",
  filename: "Lucas Home - Full Color (2) (1).glb",
  fileSize: 200_042_900,
  lastModified: 1,
  useDraco: true,
  useMeshopt: false,
};

const stats: ModelStats = {
  filename: source.filename,
  fileSize: source.fileSize,
  width: 46,
  height: 12,
  depth: 39,
  meshCount: 80,
  materialCount: 20,
  drawCallCount: 80,
  normalizationOffset: { x: 62.55, y: 2.46, z: 52.12 },
};

const viewpoints: TourViewpoint[] = [
  {
    id: "b",
    name: "Second",
    description: "",
    position: [1, 2, 3],
    quaternion: [0, 0, 0, 1],
    target: [1, 2, 0],
    fov: 46,
    order: 5,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "a",
    name: "First",
    description: "",
    position: [4, 5, 6],
    quaternion: [0, 0, 0, 1],
    target: [0, 5, 6],
    fov: 50,
    order: 1,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

describe("buildPublishedTourData", () => {
  it("serializes plain tuples and stable model transform", () => {
    const data = buildPublishedTourData({
      source,
      stats,
      viewpoints,
      startViewpointId: "a",
    });
    expect(data.viewpoints?.map((item) => item.id)).toEqual(["a", "b"]);
    expect(data.viewpoints?.map((item) => item.order)).toEqual([0, 1]);
    expect(data.model.transform).toEqual({
      position: [62.55, 2.46, 52.12],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
    expect(data.model.url.startsWith("blob:")).toBe(false);
    expect(data.model.url.includes("Lucas") || data.model.url.includes("lucas-home")).toBe(
      true,
    );
    expect(data.schemaVersion).toBe(3);
    expect(data.startView.id).toBe("a");
    expect(data.navigation.movementSpeed).toBe(2);
    expect(data.scene.environment).toBe("day");
    expect(data.scene.ground.enabled).toBe(true);
    expect(data.scene.ground.siteGradeY).toBeCloseTo(0);
  });

  it("rejects local-only model URLs", () => {
    expect(isPublishableModelUrl("blob:http://localhost/1")).toBe(false);
    expect(isPublishableModelUrl("file:///tmp/a.glb")).toBe(false);
    expect(isPublishableModelUrl("/models/house.glb")).toBe(true);
    expect(() =>
      buildPublishedTourData({
        source: { ...source, url: "blob:http://localhost/1" },
        stats,
        viewpoints,
        startViewpointId: "a",
      }),
    ).toThrow(/only exists in your browser/i);
  });
});
