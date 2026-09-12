const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

export type ModelSource = {
  url: string;
  filename: string;
  fileSize: number | null;
  lastModified: number | null;
  useDraco: boolean;
  useMeshopt: boolean;
};

export type NormalizationOffset = {
  x: number;
  y: number;
  z: number;
};

export type ModelStats = {
  filename: string;
  fileSize: number | null;
  width: number;
  height: number;
  depth: number;
  meshCount: number;
  materialCount: number;
  drawCallCount?: number;
  normalizationOffset: NormalizationOffset;
};

export function lastModifiedFromHeader(value: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function isGlbFileName(name: string) {
  return name.toLowerCase().endsWith(".glb");
}

export async function glbLoaderFlagsFromBlob(blob: Blob) {
  if (blob.size < 20) {
    return { useDraco: false, useMeshopt: false };
  }

  const header = await blob.slice(0, 20).arrayBuffer();
  const view = new DataView(header);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    return { useDraco: false, useMeshopt: false };
  }

  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== JSON_CHUNK) {
    return { useDraco: false, useMeshopt: false };
  }

  const jsonBlob = blob.slice(20, 20 + jsonChunkLength);
  return glbLoaderFlagsFromJsonBytes(new Uint8Array(await jsonBlob.arrayBuffer()));
}

function glbLoaderFlagsFromJsonBytes(jsonBytes: Uint8Array) {
  try {
    const json = JSON.parse(new TextDecoder().decode(jsonBytes)) as {
      extensionsUsed?: string[];
      extensionsRequired?: string[];
    };
    const extensions = [
      ...(json.extensionsUsed ?? []),
      ...(json.extensionsRequired ?? []),
    ];
    return {
      useDraco: extensions.includes("KHR_draco_mesh_compression"),
      useMeshopt: extensions.includes("EXT_meshopt_compression"),
    };
  } catch {
    return { useDraco: false, useMeshopt: false };
  }
}

export function glbLoaderFlags(buffer: ArrayBuffer) {
  try {
    if (buffer.byteLength < 20) {
      return { useDraco: false, useMeshopt: false };
    }

    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== GLB_MAGIC) {
      return { useDraco: false, useMeshopt: false };
    }

    const jsonChunkLength = view.getUint32(12, true);
    const jsonChunkType = view.getUint32(16, true);
    if (jsonChunkType !== JSON_CHUNK) {
      return { useDraco: false, useMeshopt: false };
    }
    if (buffer.byteLength < 20 + jsonChunkLength) {
      return { useDraco: false, useMeshopt: false };
    }

    return glbLoaderFlagsFromJsonBytes(
      new Uint8Array(buffer, 20, jsonChunkLength),
    );
  } catch {
    return { useDraco: false, useMeshopt: false };
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMeters(value: number) {
  return `${value.toFixed(2)} m`;
}
