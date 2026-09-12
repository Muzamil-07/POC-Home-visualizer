import { describe, expect, it } from "vitest";
import {
  lightingModeSchema,
  migratePublishedTourData,
  normalizePublishedTourData,
  parsePublishedTourData,
  publishTourRequestSchema,
  publishedTourDataSchema,
} from "./tour-schema";
import type { PublishedTourData } from "./tour-schema";

function sampleTourV1(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    model: {
      url: "/models/colored-house.glb",
      filename: "colored-house.glb",
      byteSize: 1024,
      fingerprint: "house::1024::1",
      transform: {
        position: [1, 2, 3],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      bounds: {
        min: [-5, 0, -5],
        max: [5, 4, 5],
      },
    },
    viewpoints: [
      {
        id: "vp-1",
        order: 1,
        name: "Entrance",
        description: "",
        position: [0, 1.6, 4],
        quaternion: [0, 0, 0, 1],
        target: [0, 1.6, 0],
        fov: 46,
      },
      {
        id: "vp-2",
        order: 0,
        name: "Living",
        description: "Main room",
        position: [2, 1.7, -1],
        quaternion: [0, 0.7071, 0, 0.7071],
        target: [3, 1.7, -1],
        fov: 52,
      },
    ],
    player: {
      startViewpointId: "vp-1",
      defaultEnvironment: "night",
      allowEnvironmentSwitch: true,
      transitionDuration: 1.1,
      autoplayEnabled: false,
      dwellTime: 2.5,
    },
    ...overrides,
  };
}

function sampleViewpoints() {
  return sampleTourV1().viewpoints as NonNullable<PublishedTourData["viewpoints"]>;
}

describe("published tour schema", () => {
  it("migrates v1 evening/night tours to Day with ground settings", () => {
    const parsed = parsePublishedTourData(sampleTourV1());
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.scene.environment).toBe("day");
    expect(parsed.scene.ground.enabled).toBe(true);
    expect(parsed.scene.ground.siteGradeY).toBeCloseTo(0);
    expect(parsed.startView.id).toBe("vp-1");
    expect(parsed.navigation.eyeHeight).toBeCloseTo(1.65);
    expect(parsed.player?.autoplayEnabled).toBe(false);
    expect(parsed.player).not.toHaveProperty("defaultEnvironment");
    expect(parsed.player).not.toHaveProperty("allowEnvironmentSwitch");
  });

  it("round-trips a valid snapshot and normalizes order", () => {
    const parsed = parsePublishedTourData(sampleTourV1());
    const normalized = normalizePublishedTourData(parsed);
    expect(normalized.viewpoints?.map((item) => item.id)).toEqual([
      "vp-2",
      "vp-1",
    ]);
    expect(normalized.viewpoints?.map((item) => item.order)).toEqual([0, 1]);
    expect(parsePublishedTourData(JSON.parse(JSON.stringify(normalized)))).toEqual(
      normalized,
    );
  });

  it("rejects duplicate viewpoint ids", () => {
    const migrated = migratePublishedTourData(
      sampleTourV1({
        viewpoints: [
          sampleViewpoints()[0]!,
          {
            ...sampleViewpoints()[1]!,
            id: "vp-1",
          },
        ],
      }),
    );
    expect(publishedTourDataSchema.safeParse(migrated).success).toBe(false);
  });

  it("rejects duplicate order values", () => {
    const migrated = migratePublishedTourData(
      sampleTourV1({
        viewpoints: [
          sampleViewpoints()[0]!,
          {
            ...sampleViewpoints()[1]!,
            order: 1,
          },
        ],
      }),
    );
    expect(publishedTourDataSchema.safeParse(migrated).success).toBe(false);
  });

  it("rejects NaN and infinite camera numbers", () => {
    const withNaN = sampleTourV1();
    const viewpointsNaN = sampleViewpoints();
    withNaN.viewpoints = [
      {
        ...viewpointsNaN[0]!,
        position: [Number.NaN, 1, 1],
      },
      viewpointsNaN[1]!,
    ];
    expect(publishedTourDataSchema.safeParse(withNaN).success).toBe(false);

    const withInf = sampleTourV1();
    const viewpointsInf = sampleViewpoints();
    withInf.viewpoints = [
      {
        ...viewpointsInf[0]!,
        target: [0, Number.POSITIVE_INFINITY, 0],
      },
      viewpointsInf[1]!,
    ];
    expect(publishedTourDataSchema.safeParse(withInf).success).toBe(false);
  });

  it("rejects an out-of-range FOV", () => {
    const fov = sampleTourV1();
    (fov.viewpoints as NonNullable<PublishedTourData["viewpoints"]>)[0] = {
      ...(fov.viewpoints as NonNullable<PublishedTourData["viewpoints"]>)[0]!,
      fov: 140,
    };
    expect(publishedTourDataSchema.safeParse(fov).success).toBe(false);
  });

  it("uses the first ordered viewpoint when the saved start id is missing", () => {
    const missingStart = sampleTourV1({
      player: {
        ...(sampleTourV1().player as object),
        startViewpointId: "missing",
      },
    });
    const parsed = parsePublishedTourData(missingStart);
    expect(parsed.startView.id).toBe("vp-2");
  });

  it("rejects blob, file, and empty model URLs", () => {
    expect(
      publishedTourDataSchema.safeParse(
        sampleTourV1({
          model: { ...(sampleTourV1().model as object), url: "blob:http://localhost/abc" },
        }),
      ).success,
    ).toBe(false);
    expect(
      publishedTourDataSchema.safeParse(
        sampleTourV1({
          model: { ...(sampleTourV1().model as object), url: "file:///tmp/house.glb" },
        }),
      ).success,
    ).toBe(false);
    expect(
      publishedTourDataSchema.safeParse(
        sampleTourV1({
          model: { ...(sampleTourV1().model as object), url: "" },
        }),
      ).success,
    ).toBe(false);
  });

  it("accepts same-origin public model URLs", () => {
    const parsed = parsePublishedTourData(sampleTourV1());
    expect(parsed.model.url).toBe("/models/colored-house.glb");
  });

  it("maps legacy lighting fields on create payloads to Day", () => {
    expect(lightingModeSchema.parse("day")).toBe("day");
    expect(lightingModeSchema.safeParse("evening").success).toBe(false);
    const payload = publishTourRequestSchema.parse({
      title: "Lucas House",
      isPublished: true,
      defaultEnvironment: "night",
      allowEnvironmentSwitch: true,
      tourData: sampleTourV1(),
    });
    expect(payload.title).toBe("Lucas House");
    expect(payload.tourData.scene.environment).toBe("day");
    expect(payload.defaultEnvironment).toBe("night");
  });

  it("rejects an empty viewpoint list without a Start View", () => {
    expect(
      publishedTourDataSchema.safeParse(sampleTourV1({ viewpoints: [] })).success,
    ).toBe(false);
  });

  it("accepts a Start View without leftover viewpoints", () => {
    const parsed = parsePublishedTourData(
      sampleTourV1({
        startView: {
          id: "vp-1",
          name: "Entrance",
          position: [0, 1.65, 8],
          quaternion: [0, 0, 0, 1],
          target: [0, 1.65, 0],
          fov: 46,
        },
        viewpoints: [],
      }),
    );
    expect(parsed.startView.id).toBe("vp-1");
    expect(parsed.viewpoints).toEqual([]);
  });
});
