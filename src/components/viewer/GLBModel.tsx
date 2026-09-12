"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DefaultLoadingManager } from "three";
import { DRACOLoader, GLTFLoader, type GLTF } from "three-stdlib";
import { useThree } from "@react-three/fiber";
import {
  DoubleSide,
  Group,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  type Side,
} from "three";
import type { Vector3Tuple } from "@/lib/tour-schema";
import type { ModelSource, ModelStats } from "./glb";
import { formatBytes } from "./glb";
import { computeOverviewLookAt, isCameraControls } from "./editor-camera";
import { registerGlbRoot, getGlbRoot } from "./glb-root";
import { disposeTemplateBoundsTrees } from "@/lib/tour-template-generator";
import { setModelLoadProgress } from "@/lib/load-progress";
import {
  disposeOptimizedScene,
  disposeSourceGeometries,
  optimizeSceneForViewing,
  sceneFootprint,
  type OptimizedScene,
} from "@/lib/model-optimize";

export type ModelTransform = {
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
};

type GLBModelProps = {
  source: ModelSource;
  wireframe: boolean;
  doubleSided: boolean;
  onReady: (stats: ModelStats) => void;
  lockedTransform?: ModelTransform | null;
  autoFrame?: boolean;
};

type Sized = {
  x: number;
  y: number;
  z: number;
};

const gltfPromises = new Map<string, Promise<GLTF>>();
let dracoLoader: DRACOLoader | null = null;

function getDracoLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.5/",
    );
  }
  return dracoLoader;
}

export function clearGltfPromise(url: string) {
  gltfPromises.delete(url);
}

async function readResponseBuffer(
  response: Response,
  onProgress: (received: number, total: number) => void,
) {
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body) {
    return response.arrayBuffer();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onProgress(received, total);
    }
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

function loadGltf(source: ModelSource) {
  const cached = gltfPromises.get(source.url);
  if (cached) return cached;

  const promise = (async () => {
    DefaultLoadingManager.itemStart(source.url);
    try {
      setModelLoadProgress({ message: "Downloading model…", ratio: 0 });
      const response = await fetch(source.url);
      if (!response.ok) {
        throw new Error("Couldn't load this GLB. The file may be invalid or corrupted.");
      }

      const buffer = await readResponseBuffer(response, (received, total) => {
        const knownTotal = total || source.fileSize || 0;
        setModelLoadProgress({
          message: knownTotal
            ? `Downloading ${formatBytes(received)} / ${formatBytes(knownTotal)}`
            : `Downloading ${formatBytes(received)}`,
          ratio: knownTotal ? Math.min(0.92, received / knownTotal) : null,
        });
      });

      setModelLoadProgress({ message: "Parsing GLB…", ratio: 0.93 });
      const loader = new GLTFLoader();
      loader.setDRACOLoader(getDracoLoader());
      if (source.useMeshopt) {
        try {
          const meshopt = await import(
            "three/examples/jsm/libs/meshopt_decoder.module.js"
          );
          if (meshopt.MeshoptDecoder) {
            loader.setMeshoptDecoder(meshopt.MeshoptDecoder);
          }
        } catch {
          // Uncompressed models still parse without Meshopt.
        }
      }

      const gltf = await loader.parseAsync(buffer, "");
      DefaultLoadingManager.itemEnd(source.url);
      return gltf;
    } catch (error) {
      DefaultLoadingManager.itemError(source.url);
      gltfPromises.delete(source.url);
      throw error;
    }
  })();

  gltfPromises.set(source.url, promise);
  return promise;
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh;
}

function getMaterials(mesh: Mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function collectStats(root: Object3D) {
  let meshCount = 0;
  const uniqueMaterials = new Set<Material>();

  root.traverse((object) => {
    if (!isMesh(object)) return;
    meshCount += 1;
    for (const material of getMaterials(object)) {
      uniqueMaterials.add(material);
    }
  });

  return { meshCount, materialCount: uniqueMaterials.size };
}

function applyDebugMaterials(
  root: Object3D,
  showWireframe: boolean,
  doubleSided: boolean,
) {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    for (const material of getMaterials(object)) {
      if ("wireframe" in material) {
        (material as Material & { wireframe: boolean }).wireframe =
          showWireframe;
      }
      const originalSide = material.userData.originalSide as Side | undefined;
      material.side = doubleSided ? DoubleSide : (originalSide ?? material.side);
      material.needsUpdate = true;
    }
  });
}

function frameNormalizedModel(
  camera: PerspectiveCamera,
  controls: unknown,
  size: Sized,
) {
  const look = computeOverviewLookAt(
    { width: size.x, height: size.y, depth: size.z },
    Math.max(camera.aspect, 0.1),
    camera.fov,
  );

  camera.near = look.near;
  camera.far = look.far;
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();

  if (isCameraControls(controls)) {
    void controls.setLookAt(
      look.position.x,
      look.position.y,
      look.position.z,
      look.target.x,
      look.target.y,
      look.target.z,
      false,
    );
    return;
  }

  camera.position.copy(look.position);
  camera.lookAt(look.target);
}

export function GLBModel({
  source,
  wireframe,
  doubleSided,
  onReady,
  lockedTransform = null,
  autoFrame = true,
}: GLBModelProps) {
  const [prepared, setPrepared] = useState<
    (OptimizedScene & { size: Sized; offset: Sized }) | null
  >(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const getThree = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const didFrame = useRef(false);
  const rootRef = useRef<Group>(null);

  useEffect(() => {
    let cancelled = false;
    didFrame.current = false;

    void (async () => {
      try {
        const gltf = await loadGltf(source);
        if (cancelled) return;
        const originalStats = collectStats(gltf.scene);
        setModelLoadProgress({
          message:
            originalStats.meshCount > 250
              ? `Optimizing ${originalStats.meshCount.toLocaleString()} meshes…`
              : "Preparing model…",
          ratio: 0.95,
        });
        const optimized = await optimizeSceneForViewing(
          gltf.scene,
          (message, ratio) => {
            setModelLoadProgress({
              message,
              ratio: ratio == null ? 0.96 : 0.95 + ratio * 0.04,
            });
          },
        );
        if (cancelled) {
          disposeOptimizedScene(optimized.group, optimized.merged);
          return;
        }
        if (optimized.merged) {
          disposeSourceGeometries(gltf.scene);
        }
        gltfPromises.delete(source.url);
        const footprint = sceneFootprint(optimized.group);
        setPrepared({
          ...optimized,
          ...footprint,
          originalMeshCount: originalStats.meshCount,
        });
        setModelLoadProgress(null);
      } catch (error: unknown) {
        if (cancelled) return;
        setModelLoadProgress(null);
        setLoadError(
          error instanceof Error
            ? error
            : new Error("Couldn't load this GLB. The file may be invalid or corrupted."),
        );
      }
    })();

    return () => {
      cancelled = true;
      setModelLoadProgress(null);
    };
  }, [source]);

  useEffect(() => {
    const root = prepared?.group;
    if (!root) return;
    return () => {
      disposeTemplateBoundsTrees(root);
      disposeOptimizedScene(root, Boolean(prepared?.merged));
    };
  }, [prepared?.group, prepared?.merged]);

  useEffect(() => {
    if (!prepared) return;
    applyDebugMaterials(prepared.group, wireframe, doubleSided);
  }, [prepared, wireframe, doubleSided]);

  useLayoutEffect(() => {
    if (!prepared) return;
    onReady({
      filename: source.filename,
      fileSize: source.fileSize,
      width: prepared.size.x,
      height: prepared.size.y,
      depth: prepared.size.z,
      meshCount: prepared.originalMeshCount,
      materialCount: collectStats(prepared.group).materialCount,
      drawCallCount: prepared.drawCalls,
      normalizationOffset: prepared.offset,
    });
  }, [onReady, source.filename, source.fileSize, prepared]);

  useEffect(() => {
    if (!autoFrame || !prepared || didFrame.current) return;

    const frameId = requestAnimationFrame(() => {
      if (didFrame.current) return;
      didFrame.current = true;

      const { camera, controls } = getThree();
      frameNormalizedModel(
        camera as PerspectiveCamera,
        controls,
        prepared.size,
      );
      invalidate();
    });

    return () => cancelAnimationFrame(frameId);
  }, [autoFrame, getThree, invalidate, prepared]);

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (node) registerGlbRoot(node);
    return () => {
      if (node && getGlbRoot() === node) {
        registerGlbRoot(null);
      }
    };
  }, [prepared]);

  if (loadError) throw loadError;
  if (!prepared) return null;

  const position = lockedTransform?.position ?? [
    prepared.offset.x,
    prepared.offset.y,
    prepared.offset.z,
  ];
  const rotation = lockedTransform?.rotation ?? [0, 0, 0];
  const scale = lockedTransform?.scale ?? [1, 1, 1];

  return (
    <group
      ref={rootRef}
      name="glb-root"
      position={position}
      rotation={rotation}
      scale={scale}
    >
      <primitive object={prepared.group} />
    </group>
  );
}
