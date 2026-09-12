import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HOUSE_OBJECT,
  GENERATED_NORMALS_OBJECT,
  MODELS_BUCKET,
  defaultHouseStorageUrl,
  encodeModelUrl,
  generatedNormalsStorageUrl,
  isTourModelsPublicUrl,
  publicStorageObjectUrl,
  sanitizeModelFilename,
} from "./model-storage";
import {
  houseModelUrlForNormals,
  isHouseNormalsModelUrl,
  publishedHouseModelUrl,
  resolveHouseModelUrl,
} from "./house-model";

const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  house: process.env.NEXT_PUBLIC_DEFAULT_HOUSE_URL,
  normals: process.env.NEXT_PUBLIC_GENERATED_NORMALS_HOUSE_URL,
};

function restoreEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_DEFAULT_HOUSE_URL" | "NEXT_PUBLIC_GENERATED_NORMALS_HOUSE_URL",
  value: string | undefined,
) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalEnv.url);
  restoreEnv("NEXT_PUBLIC_DEFAULT_HOUSE_URL", originalEnv.house);
  restoreEnv("NEXT_PUBLIC_GENERATED_NORMALS_HOUSE_URL", originalEnv.normals);
});

describe("model storage URLs", () => {
  it("builds public object URLs from the project URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co/";
    expect(publicStorageObjectUrl(MODELS_BUCKET, DEFAULT_HOUSE_OBJECT)).toBe(
      `https://abc.supabase.co/storage/v1/object/public/${MODELS_BUCKET}/${DEFAULT_HOUSE_OBJECT}`,
    );
    expect(isTourModelsPublicUrl(defaultHouseStorageUrl()!)).toBe(true);
    expect(isTourModelsPublicUrl(generatedNormalsStorageUrl()!)).toBe(true);
  });

  it("prefers explicit house URL overrides", () => {
    process.env.NEXT_PUBLIC_DEFAULT_HOUSE_URL = "https://cdn.example/house.glb";
    process.env.NEXT_PUBLIC_GENERATED_NORMALS_HOUSE_URL =
      "https://cdn.example/normals.glb";
    expect(defaultHouseStorageUrl()).toBe("https://cdn.example/house.glb");
    expect(generatedNormalsStorageUrl()).toBe("https://cdn.example/normals.glb");
  });

  it("leaves https URLs unencoded and encodes local paths", () => {
    expect(encodeModelUrl("https://abc.supabase.co/file.glb")).toBe(
      "https://abc.supabase.co/file.glb",
    );
    expect(encodeModelUrl("/Lucas Home.glb")).toBe("/Lucas%20Home.glb");
  });

  it("sanitizes uploaded filenames", () => {
    expect(sanitizeModelFilename("Lucas Home (2).glb")).toBe(
      "Lucas-Home-2.glb",
    );
    expect(sanitizeModelFilename("../../secret.glb")).toBe("secret.glb");
    expect(sanitizeModelFilename("no-ext")).toBe("no-ext.glb");
  });
});

describe("house model remapping", () => {
  it("treats local and storage house URLs as the default model", () => {
    expect(
      isHouseNormalsModelUrl("/models/house-with-generated-normals.glb"),
    ).toBe(true);
    expect(
      isHouseNormalsModelUrl(
        `https://abc.supabase.co/storage/v1/object/public/${MODELS_BUCKET}/${GENERATED_NORMALS_OBJECT}`,
      ),
    ).toBe(true);
    expect(isHouseNormalsModelUrl("https://cdn.example/other.glb")).toBe(false);
  });

  it("keeps the Full Color house on its local public path", () => {
    const resolved = resolveHouseModelUrl(
      "/Lucas%20Home%20-%20Full%20Color%20(2)%20(1).glb",
    );
    expect(resolved).toBe(houseModelUrlForNormals("original"));
    expect(resolved).toContain("Lucas%20Home");
    expect(
      publishedHouseModelUrl("/models/house-with-generated-normals.glb"),
    ).toBe(houseModelUrlForNormals("original"));
  });
});
