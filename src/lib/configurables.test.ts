import { describe, expect, it } from "vitest";
import {
  addConfigurablePart,
  mergeConfiguratorChoices,
  type ConfigurableItem,
} from "./configurables";
import { configurableItemSchema } from "./tour-schema";

const sofa: ConfigurableItem = {
  id: "cfg_sofa",
  name: "Sofa",
  anchor: [1, 0.5, 2],
  parts: [
    { target: "object", key: "o12" },
    { target: "material", key: "m3" },
  ],
  colors: ["#2f3d55", "#8a9a7b"],
};

describe("mergeConfiguratorChoices", () => {
  it("applies a visitor choice to every part of the item", () => {
    const merged = mergeConfiguratorChoices(
      [{ target: "object", key: "o12", color: "#111111" }],
      [sofa],
      { cfg_sofa: "#8a9a7b" },
    );
    expect(merged).toEqual([
      { target: "object", key: "o12", color: "#8a9a7b" },
      { target: "material", key: "m3", color: "#8a9a7b" },
    ]);
  });

  it("keeps published colors when the visitor has not chosen", () => {
    const base = [{ target: "object" as const, key: "o1", color: "#111111" }];
    expect(mergeConfiguratorChoices(base, [sofa], {})).toBe(base);
  });
});

describe("configurables", () => {
  it("does not add the same part twice", () => {
    expect(addConfigurablePart(sofa, { target: "object", key: "o12" })).toBe(sofa);
  });

  it("validates a published item", () => {
    expect(configurableItemSchema.safeParse(sofa).success).toBe(true);
    expect(
      configurableItemSchema.safeParse({ ...sofa, colors: ["red"] }).success,
    ).toBe(false);
  });
});
