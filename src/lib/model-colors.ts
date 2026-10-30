import {
  BufferAttribute,
  Color,
  Material,
  Mesh,
  Object3D,
  type Intersection,
} from "three";

export type ModelColorTarget = "object" | "material";

export type ModelColorOverride = {
  target: ModelColorTarget;
  key: string;
  color: string;
};

export type ModelColorSelection = {
  objectKey: string;
  /** Picked point in glb-root local space. */
  point: [number, number, number];
  materialKey: string;
  matchingCount: number;
  currentColor: string;
};

// A contiguous vertex span of a (possibly merged) mesh that came from one
// source mesh. Keys are stable across loads of the same GLB because they come
// from traversal order, not from three.js uuids.
export type ColorRange = {
  key: string;
  start: number;
  count: number;
};

export const MAX_COLOR_OVERRIDES = 400;
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const COLOR_PRESETS = [
  { id: "white", label: "White", color: "#f2efe9" },
  { id: "greige", label: "Greige", color: "#b8ad9c" },
  { id: "sage", label: "Sage", color: "#8a9a7b" },
  { id: "navy", label: "Navy", color: "#2f3d55" },
  { id: "terracotta", label: "Terracotta", color: "#b5654a" },
  { id: "charcoal", label: "Charcoal", color: "#33363b" },
] as const;

type ColorState = {
  baseMaterial: Material | Material[];
  originalColor: BufferAttribute | null;
};

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function asList(material: Material | Material[]) {
  return Array.isArray(material) ? material : [material];
}

function materialColor(material: Material) {
  const color = (material as Material & { color?: Color }).color;
  return color instanceof Color ? color : null;
}

export function objectColorKey(index: number) {
  return `o${index}`;
}

export function materialColorKey(index: number) {
  return `m${index}`;
}

export function colorRangesOf(mesh: Mesh) {
  return (mesh.userData.colorRanges as ColorRange[] | undefined) ?? null;
}

function vertexAtFace(mesh: Mesh, faceIndex: number) {
  const index = mesh.geometry.index;
  return index ? index.getX(faceIndex * 3) : faceIndex * 3;
}

function rangeForVertex(ranges: ColorRange[], vertex: number) {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid];
    if (!range) break;
    if (vertex < range.start) high = mid - 1;
    else if (vertex >= range.start + range.count) low = mid + 1;
    else return range;
  }
  return null;
}

function countMatching(root: Object3D, materialKey: string) {
  let count = 0;
  root.traverse((object) => {
    if (!isMesh(object) || object.userData.materialKey !== materialKey) return;
    count += colorRangesOf(object)?.length ?? 0;
  });
  return count;
}

export function selectionFromIntersection(
  root: Object3D,
  intersection: Intersection,
): ModelColorSelection | null {
  const mesh = intersection.object as Mesh;
  if (!isMesh(mesh) || intersection.faceIndex == null) return null;
  const ranges = colorRangesOf(mesh);
  const materialKey = mesh.userData.materialKey as string | undefined;
  if (!ranges || !materialKey) return null;
  const range = rangeForVertex(ranges, vertexAtFace(mesh, intersection.faceIndex));
  if (!range) return null;
  const state = mesh.userData.colorState as ColorState | undefined;
  const base = asList(state?.baseMaterial ?? mesh.material)[0];
  const color = base ? materialColor(base) : null;
  const local = root.worldToLocal(intersection.point.clone());
  return {
    objectKey: range.key,
    point: [local.x, local.y, local.z],
    materialKey,
    matchingCount: countMatching(root, materialKey),
    currentColor: color ? `#${color.getHexString()}` : "#ffffff",
  };
}

function restoreMesh(mesh: Mesh, state: ColorState) {
  for (const material of asList(mesh.material)) material.dispose();
  mesh.material = state.baseMaterial;
  if (state.originalColor) {
    mesh.geometry.setAttribute("color", state.originalColor);
  } else {
    mesh.geometry.deleteAttribute("color");
  }
  delete mesh.userData.colorState;
  delete mesh.userData.colorSignature;
}

function cloneMaterials(base: Material | Material[], apply: (m: Material) => void) {
  const next = asList(base).map((material) => {
    const cloned = material.clone();
    apply(cloned);
    cloned.needsUpdate = true;
    return cloned;
  });
  return Array.isArray(base) ? next : next[0]!;
}

function writeVertexColors(
  mesh: Mesh,
  state: ColorState,
  fill: Color,
  ranges: { range: ColorRange; color: Color }[],
) {
  const count = mesh.geometry.getAttribute("position").count;
  const current = mesh.geometry.getAttribute("color");
  const reusable =
    current instanceof BufferAttribute &&
    current !== state.originalColor &&
    current.count === count &&
    current.itemSize === 3;
  const attribute = reusable
    ? current
    : new BufferAttribute(new Float32Array(count * 3), 3);
  const array = attribute.array as Float32Array;
  const original = state.originalColor;

  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    array[offset] = fill.r * (original ? original.getX(i) : 1);
    array[offset + 1] = fill.g * (original ? original.getY(i) : 1);
    array[offset + 2] = fill.b * (original ? original.getZ(i) : 1);
  }
  for (const { range, color } of ranges) {
    const end = Math.min(count, range.start + range.count);
    for (let i = range.start; i < end; i += 1) {
      const offset = i * 3;
      array[offset] = color.r * (original ? original.getX(i) : 1);
      array[offset + 1] = color.g * (original ? original.getY(i) : 1);
      array[offset + 2] = color.b * (original ? original.getZ(i) : 1);
    }
  }

  attribute.needsUpdate = true;
  if (!reusable) mesh.geometry.setAttribute("color", attribute);
}

function signatureOf(
  materialOverride: string | undefined,
  objectHits: { range: ColorRange; hex: string }[],
) {
  return `${materialOverride ?? ""}|${objectHits
    .map((hit) => `${hit.range.key}:${hit.hex}`)
    .join(",")}`;
}

/**
 * Recolors the prepared GLB root. Object overrides win over material
 * overrides. Untouched meshes keep their shared materials; touched meshes get
 * their own material clone so other draw calls are not affected. Calling this
 * again with fewer overrides restores the original materials.
 */
export function applyColorOverrides(
  root: Object3D,
  overrides: readonly ModelColorOverride[],
) {
  const byObject = new Map<string, string>();
  const byMaterial = new Map<string, string>();
  for (const override of overrides) {
    if (!HEX_COLOR_PATTERN.test(override.color)) continue;
    (override.target === "object" ? byObject : byMaterial).set(
      override.key,
      override.color.toLowerCase(),
    );
  }

  root.traverse((object) => {
    if (!isMesh(object)) return;
    const ranges = colorRangesOf(object);
    if (!ranges) return;
    const existing = object.userData.colorState as ColorState | undefined;
    let materialHex = byMaterial.get(object.userData.materialKey as string);
    let objectHits = byObject.size
      ? ranges.flatMap((range) => {
          const hex = byObject.get(range.key);
          return hex ? [{ range, hex }] : [];
        })
      : [];
    // A mesh that is a single object is tinted like a material. This also
    // keeps vertex colors off geometry that unmerged meshes may share.
    if (ranges.length === 1 && objectHits.length === 1) {
      materialHex = objectHits[0]!.hex;
      objectHits = [];
    }

    if (!materialHex && objectHits.length === 0) {
      if (existing) restoreMesh(object, existing);
      return;
    }

    const signature = signatureOf(materialHex, objectHits);
    if (existing && object.userData.colorSignature === signature) return;

    const state: ColorState = existing ?? {
      baseMaterial: object.material,
      originalColor:
        asList(object.material).some((material) => material.vertexColors) &&
        object.geometry.getAttribute("color") instanceof BufferAttribute
          ? (object.geometry.getAttribute("color") as BufferAttribute)
          : null,
    };
    const baseColor = materialColor(asList(state.baseMaterial)[0]!);
    const fill = materialHex
      ? new Color(materialHex)
      : (baseColor?.clone() ?? new Color(1, 1, 1));

    if (objectHits.length === 0) {
      // Whole mesh takes one color: a plain material tint is enough.
      if (existing) {
        for (const material of asList(object.material)) material.dispose();
        if (state.originalColor) {
          object.geometry.setAttribute("color", state.originalColor);
        } else {
          object.geometry.deleteAttribute("color");
        }
      }
      object.material = cloneMaterials(state.baseMaterial, (material) => {
        materialColor(material)?.copy(fill);
      });
    } else {
      const reuse =
        existing &&
        asList(object.material).every((material) => material.vertexColors);
      if (!reuse) {
        if (existing) {
          for (const material of asList(object.material)) material.dispose();
        }
        object.material = cloneMaterials(state.baseMaterial, (material) => {
          materialColor(material)?.set(1, 1, 1);
          material.vertexColors = true;
        });
      }
      writeVertexColors(
        object,
        state,
        fill,
        objectHits.map((hit) => ({
          range: hit.range,
          color: new Color(hit.hex),
        })),
      );
    }

    object.userData.colorState = state;
    object.userData.colorSignature = signature;
  });
}

export function resetColorOverrides(root: Object3D) {
  applyColorOverrides(root, []);
}

export function upsertColorOverride(
  list: readonly ModelColorOverride[],
  next: ModelColorOverride,
) {
  const rest = list.filter(
    (item) => !(item.target === next.target && item.key === next.key),
  );
  return [...rest, next].slice(-MAX_COLOR_OVERRIDES);
}
