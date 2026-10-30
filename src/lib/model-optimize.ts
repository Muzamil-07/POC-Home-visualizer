import {
  Box3,
  BufferGeometry,
  Color,
  Group,
  Material,
  Mesh,
  Object3D,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { prepareNormalMappedMaterials } from "@/lib/model-normals";
import {
  materialColorKey,
  objectColorKey,
  type ColorRange,
} from "@/lib/model-colors";

export const HEAVY_MESH_COUNT = 250;
const MERGE_VERTEX_BUDGET = 480_000;

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function yieldFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function getMaterials(mesh: Mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function vertexCount(geometry: BufferGeometry) {
  return geometry.getAttribute("position")?.count ?? 0;
}

function materialSignature(material: Material) {
  const record = material as Material & {
    map?: { uuid?: string } | null;
    normalMap?: { uuid?: string } | null;
    normalScale?: { x?: number } | null;
    color?: Color;
    opacity?: number;
    transparent?: boolean;
    roughness?: number;
    metalness?: number;
  };
  const color =
    record.color instanceof Color ? record.color.getHexString() : "none";
  return [
    record.map?.uuid ?? "nomap",
    record.normalMap?.uuid ?? "nonormal",
    Math.round((record.normalScale?.x ?? 1) * 100),
    color,
    Math.round((record.opacity ?? 1) * 50),
    record.transparent ? 1 : 0,
    Math.round((record.roughness ?? 0.5) * 10),
    Math.round((record.metalness ?? 0) * 10),
    material.side,
  ].join("|");
}

function cloneMaterial(material: Material) {
  const cloned = material.clone();
  cloned.userData = {
    ...cloned.userData,
    originalSide: material.side,
  };
  return cloned;
}

export type OptimizedScene = {
  group: Group;
  originalMeshCount: number;
  drawCalls: number;
  merged: boolean;
};

function alignAttributes(geometries: BufferGeometry[]) {
  if (geometries.length < 2) return;
  const first = geometries[0];
  if (!first) return;
  const shared = new Set(Object.keys(first.attributes));
  for (const geometry of geometries) {
    for (const name of [...shared]) {
      const attribute = geometry.getAttribute(name);
      const reference = first.getAttribute(name);
      if (
        !attribute ||
        !reference ||
        attribute.itemSize !== reference.itemSize
      ) {
        shared.delete(name);
      }
    }
  }
  shared.add("position");
  for (const geometry of geometries) {
    for (const name of Object.keys(geometry.attributes)) {
      if (!shared.has(name)) geometry.deleteAttribute(name);
    }
    geometry.morphAttributes = {};
  }
}

function applyMeshShadows(mesh: Mesh) {
  mesh.receiveShadow = true;
  if (!mesh.geometry.boundingBox) {
    mesh.geometry.computeBoundingBox();
  }
  const size = new Vector3();
  mesh.geometry.boundingBox?.getSize(size);
  mesh.castShadow = size.y > 0.28 || size.x * size.z > 8;
}

type ChunkPart = {
  geometry: BufferGeometry;
  colorKey: string;
};

function tagSourceMeshes(meshes: Mesh[]) {
  const firstBySignature = new Map<string, number>();
  meshes.forEach((mesh, index) => {
    const material = getMaterials(mesh)[0];
    const signature = material ? materialSignature(material) : "none";
    if (!firstBySignature.has(signature)) {
      firstBySignature.set(signature, index);
    }
    mesh.userData.colorKey = objectColorKey(index);
    mesh.userData.materialKey = materialColorKey(
      firstBySignature.get(signature) ?? index,
    );
  });
}

function addMergedMesh(
  group: Group,
  geometry: BufferGeometry,
  material: Material,
  materialKey: string,
  colorRanges: ColorRange[],
) {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.userData.materialKey = materialKey;
  mesh.userData.colorRanges = colorRanges;
  applyMeshShadows(mesh);
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = true;
  group.add(mesh);
}

function singleRange(part: ChunkPart): ColorRange[] {
  return [{ key: part.colorKey, start: 0, count: vertexCount(part.geometry) }];
}

function flushChunk(
  group: Group,
  chunk: ChunkPart[],
  material: Material,
  materialKey: string,
) {
  if (chunk.length === 0) return 0;
  if (chunk.length === 1) {
    const part = chunk[0];
    if (!part) return 0;
    addMergedMesh(group, part.geometry, material, materialKey, singleRange(part));
    return 1;
  }

  const geometries = chunk.map((part) => part.geometry);
  alignAttributes(geometries);
  let merged: BufferGeometry | null = null;
  try {
    merged = mergeGeometries(geometries, false);
  } catch {
    merged = null;
  }

  if (merged) {
    // mergeGeometries appends vertices in order, so each source mesh owns a
    // contiguous vertex span in the merged buffer.
    const ranges: ColorRange[] = [];
    let start = 0;
    for (const part of chunk) {
      const count = vertexCount(part.geometry);
      ranges.push({ key: part.colorKey, start, count });
      start += count;
    }
    for (const geometry of geometries) geometry.dispose();
    addMergedMesh(group, merged, material, materialKey, ranges);
    return 1;
  }

  for (const part of chunk) {
    addMergedMesh(group, part.geometry, material, materialKey, singleRange(part));
  }
  return chunk.length;
}

export async function optimizeSceneForViewing(
  source: Object3D,
  onProgress: (message: string, ratio?: number) => void,
): Promise<OptimizedScene> {
  source.updateWorldMatrix(true, true);

  const meshes: Mesh[] = [];
  let skinned = false;
  source.traverse((object) => {
    if (!isMesh(object) || !object.geometry) return;
    if ((object as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) {
      skinned = true;
    }
    meshes.push(object);
  });

  const originalMeshCount = meshes.length;
  tagSourceMeshes(meshes);
  if (skinned || originalMeshCount < 80) {
    const group = lightweightClone(source);
    prepareNormalMappedMaterials(group);
    group.userData.originalMeshCount = originalMeshCount;
    return {
      group,
      originalMeshCount,
      drawCalls: originalMeshCount,
      merged: false,
    };
  }

  onProgress("Merging meshes…", 0);
  const buckets = new Map<
    string,
    { material: Material; materialKey: string; meshes: Mesh[] }
  >();
  for (const mesh of meshes) {
    const material = getMaterials(mesh)[0];
    if (!material) continue;
    const key = materialSignature(material);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        material: cloneMaterial(material),
        materialKey: mesh.userData.materialKey as string,
        meshes: [],
      };
      buckets.set(key, bucket);
    }
    bucket.meshes.push(mesh);
  }

  const group = new Group();
  group.name = "optimized-glb";
  group.userData.originalMeshCount = originalMeshCount;
  let drawCalls = 0;
  let processed = 0;

  for (const bucket of buckets.values()) {
    let chunk: ChunkPart[] = [];
    let verts = 0;

    for (const mesh of bucket.meshes) {
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      const count = vertexCount(geometry);
      if (chunk.length > 0 && verts + count > MERGE_VERTEX_BUDGET) {
        drawCalls += flushChunk(group, chunk, bucket.material, bucket.materialKey);
        chunk = [];
        verts = 0;
      }
      chunk.push({ geometry, colorKey: mesh.userData.colorKey as string });
      verts += count;
      processed += 1;
      if (processed % 64 === 0) {
        onProgress(
          "Merging meshes…",
          Math.min(0.98, processed / Math.max(meshes.length, 1)),
        );
        await yieldFrame();
      }
    }

    drawCalls += flushChunk(group, chunk, bucket.material, bucket.materialKey);
  }

  const box = new Box3().setFromObject(group);
  if (box.isEmpty()) {
    disposeOptimizedScene(group, true);
    const fallback = lightweightClone(source);
    prepareNormalMappedMaterials(fallback);
    fallback.userData.originalMeshCount = originalMeshCount;
    return {
      group: fallback,
      originalMeshCount,
      drawCalls: originalMeshCount,
      merged: false,
    };
  }

  prepareNormalMappedMaterials(group);
  return {
    group,
    originalMeshCount,
    drawCalls: Math.max(1, drawCalls),
    merged: true,
  };
}

export function disposeSourceGeometries(root: Object3D) {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    object.geometry.dispose();
  });
}

function lightweightClone(source: Object3D) {
  const group = new Group();
  group.name = "glb-scene";
  const cloned = source.clone(true);
  cloned.traverse((object) => {
    if (!isMesh(object)) return;
    applyMeshShadows(object);
    if (typeof object.userData.colorKey === "string") {
      object.userData.colorRanges = [
        {
          key: object.userData.colorKey,
          start: 0,
          count: vertexCount(object.geometry),
        },
      ] satisfies ColorRange[];
    }
    object.matrixAutoUpdate = false;
    object.updateMatrix();
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });
  cloned.updateMatrixWorld(true);
  group.add(cloned);
  return group;
}

export function disposeOptimizedScene(root: Object3D, merged: boolean) {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    if (merged) {
      object.geometry.dispose();
    }
    for (const material of getMaterials(object)) {
      material.dispose();
    }
  });
}

export function sceneFootprint(root: Object3D) {
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  return {
    size: { x: size.x, y: size.y, z: size.z },
    offset: box.isEmpty()
      ? { x: 0, y: 0, z: 0 }
      : { x: -center.x, y: -box.min.y, z: -center.z },
  };
}
