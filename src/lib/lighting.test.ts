import { describe, expect, it } from "vitest";
import { DAY_ENVIRONMENT, coerceEnvironment, isLightingMode } from "./lighting";
import { lightingModeSchema } from "./tour-schema";

describe("day lighting", () => {
  it("keeps a single Day environment", () => {
    expect(DAY_ENVIRONMENT).toBe("day");
    expect(isLightingMode("day")).toBe(true);
    expect(isLightingMode("evening")).toBe(false);
    expect(isLightingMode("night")).toBe(false);
    expect(coerceEnvironment("evening")).toBe("day");
    expect(coerceEnvironment("night")).toBe("day");
    expect(lightingModeSchema.parse("day")).toBe("day");
    expect(lightingModeSchema.safeParse("night").success).toBe(false);
  });
});
