import {
  BufferGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
} from "three";

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function getMaterials(mesh: Mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function isStandardMaterial(material: Material): material is MeshStandardMaterial {
  return (
    "isMeshStandardMaterial" in material &&
    (material as MeshStandardMaterial).isMeshStandardMaterial === true
  );
}

function ensureTangents(geometry: BufferGeometry) {
  if (geometry.getAttribute("tangent")) return;
  if (!geometry.index) return;
  if (!geometry.getAttribute("position")) return;
  if (!geometry.getAttribute("normal")) return;
  if (!geometry.getAttribute("uv")) return;
  try {
    geometry.computeTangents();
  } catch {
    // Derivative TBN still works if tangents cannot be built.
  }
}

export function prepareNormalMappedMaterials(root: Object3D) {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    const materials = getMaterials(object);
    let usesNormalMap = false;
    for (const material of materials) {
      if (!isStandardMaterial(material) || !material.normalMap) continue;
      usesNormalMap = true;
      material.normalMap.colorSpace = NoColorSpace;
      material.normalMap.flipY = false;
      material.normalMap.needsUpdate = true;
      if (material.normalScale.lengthSq() < 1e-6) {
        material.normalScale.set(1, 1);
      }
      material.needsUpdate = true;
    }
    if (usesNormalMap) {
      ensureTangents(object.geometry);
    }
  });
}
