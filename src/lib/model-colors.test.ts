import { describe, expect, it } from "vitest";
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Intersection,
} from "three";
import {
  applyColorOverrides,
  selectionFromIntersection,
  upsertColorOverride,
  type ColorRange,
} from "./model-colors";

function mergedMesh(ranges: ColorRange[], materialKey = "m0") {
  const vertices = ranges.reduce((sum, range) => sum + range.count, 0);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(vertices * 3), 3),
  );
  const material = new MeshStandardMaterial({ color: "#808080" });
  const mesh = new Mesh(geometry, material);
  mesh.userData.colorRanges = ranges;
  mesh.userData.materialKey = materialKey;
  const root = new Group();
  root.add(mesh);
  return { root, mesh, material };
}

const twoObjects: ColorRange[] = [
  { key: "o0", start: 0, count: 3 },
  { key: "o1", start: 3, count: 3 },
];

describe("applyColorOverrides", () => {
  it("colors only the vertices of the picked object", () => {
    const { root, mesh, material } = mergedMesh(twoObjects);
    applyColorOverrides(root, [{ target: "object", key: "o1", color: "#ff0000" }]);

    const colors = mesh.geometry.getAttribute("color");
    expect(mesh.material).not.toBe(material);
    expect((mesh.material as MeshStandardMaterial).vertexColors).toBe(true);
    expect(colors.getX(0)).toBeCloseTo(material.color.r);
    expect(colors.getX(3)).toBeCloseTo(1);
    expect(colors.getY(3)).toBeCloseTo(0);
  });

  it("tints the whole mesh for a material override", () => {
    const { root, mesh } = mergedMesh(twoObjects);
    applyColorOverrides(root, [{ target: "material", key: "m0", color: "#0000ff" }]);

    expect(mesh.geometry.getAttribute("color")).toBeUndefined();
    expect((mesh.material as MeshStandardMaterial).color.getHexString()).toBe(
      "0000ff",
    );
  });

  it("restores the shared material when overrides are removed", () => {
    const { root, mesh, material } = mergedMesh(twoObjects);
    applyColorOverrides(root, [{ target: "object", key: "o0", color: "#00ff00" }]);
    applyColorOverrides(root, []);

    expect(mesh.material).toBe(material);
    expect(mesh.geometry.getAttribute("color")).toBeUndefined();
    expect(mesh.userData.colorState).toBeUndefined();
  });
});

describe("selectionFromIntersection", () => {
  it("maps a face back to its source object", () => {
    const { root, mesh } = mergedMesh(twoObjects);
    const selection = selectionFromIntersection(root, {
      object: mesh,
      faceIndex: 1,
      distance: 1,
      point: new Vector3(1, 2, 3),
    } as Intersection);

    expect(selection).toMatchObject({
      objectKey: "o1",
      materialKey: "m0",
      matchingCount: 2,
      currentColor: "#808080",
      point: [1, 2, 3],
    });
  });
});

describe("upsertColorOverride", () => {
  it("replaces an existing override for the same target", () => {
    const list = upsertColorOverride(
      [{ target: "object", key: "o1", color: "#111111" }],
      { target: "object", key: "o1", color: "#222222" },
    );
    expect(list).toEqual([{ target: "object", key: "o1", color: "#222222" }]);
  });
});
