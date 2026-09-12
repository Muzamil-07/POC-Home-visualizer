import {
  PerspectiveCamera,
  RGBAFormat,
  UnsignedByteType,
  WebGLRenderTarget,
  type Scene,
  type WebGLRenderer,
} from "three";
import { capturePixelSize } from "@/lib/ai-visualization";
import type { CaptureMetadata } from "@/types/ai-visualization";

export type SceneCaptureHandle = {
  gl: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
};

let handle: SceneCaptureHandle | null = null;

export function registerSceneCapture(next: SceneCaptureHandle | null) {
  handle = next;
}

export function getSceneCaptureHandle() {
  return handle;
}

export type CapturedView = {
  blob: Blob;
  dataUrl: string;
  base64: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  metadata: CaptureMetadata;
};

const MAX_QUALITY_ATTEMPTS = 4;

function waitFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function flipPixelsY(
  pixels: Uint8Array,
  width: number,
  height: number,
) {
  const row = width * 4;
  const copy = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    const src = (height - 1 - y) * row;
    copy.set(pixels.subarray(src, src + row), y * row);
  }
  return copy;
}

async function encodeJpeg(
  pixels: Uint8Array,
  width: number,
  height: number,
  maxBytes: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Couldn't encode the captured view.");
  }
  const image = context.createImageData(width, height);
  image.data.set(pixels);
  context.putImageData(image, 0, 0);

  let quality = 0.9;
  for (let attempt = 0; attempt < MAX_QUALITY_ATTEMPTS; attempt += 1) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((next) => resolve(next), "image/jpeg", quality);
    });
    if (!blob) throw new Error("Couldn't encode the captured view.");
    if (blob.size <= maxBytes || quality <= 0.55) {
      const dataUrl = await blobToDataUrl(blob);
      return { blob, dataUrl, quality };
    }
    quality -= 0.12;
  }
  throw new Error("The captured view is too large to upload.");
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read the captured view."));
    reader.readAsDataURL(blob);
  });
}

export async function captureCurrentView(options: {
  tourSlug: string;
  maxBytes?: number;
}): Promise<CapturedView> {
  const current = handle;
  if (!current) {
    throw new Error("The 3D scene is not ready to capture.");
  }
  const { gl, scene, camera } = current;
  const liveAspect =
    camera.aspect > 0.05 ? camera.aspect : gl.domElement.clientWidth / Math.max(gl.domElement.clientHeight, 1);
  const { width, height } = capturePixelSize(liveAspect);

  const shot = new PerspectiveCamera(
    camera.fov,
    width / height,
    camera.near,
    camera.far,
  );
  shot.position.copy(camera.position);
  shot.quaternion.copy(camera.quaternion);
  shot.up.copy(camera.up);
  shot.updateProjectionMatrix();
  shot.updateMatrixWorld(true);

  const target = new WebGLRenderTarget(width, height, {
    format: RGBAFormat,
    type: UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.colorSpace = gl.outputColorSpace;

  const previousTarget = gl.getRenderTarget();
  const previousAutoClear = gl.autoClear;
  try {
    await waitFrame();
    gl.autoClear = true;
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(scene, shot);
    const pixels = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    const flipped = flipPixelsY(pixels, width, height);
    const encoded = await encodeJpeg(
      flipped,
      width,
      height,
      options.maxBytes ?? 4_500_000,
    );
    if (encoded.blob.size < 800) {
      throw new Error("The captured view was blank. Try again after the model finishes loading.");
    }
    const comma = encoded.dataUrl.indexOf(",");
    return {
      blob: encoded.blob,
      dataUrl: encoded.dataUrl,
      base64: comma >= 0 ? encoded.dataUrl.slice(comma + 1) : encoded.dataUrl,
      mimeType: "image/jpeg",
      width,
      height,
      metadata: {
        position: [camera.position.x, camera.position.y, camera.position.z],
        quaternion: [
          camera.quaternion.x,
          camera.quaternion.y,
          camera.quaternion.z,
          camera.quaternion.w,
        ],
        fov: camera.fov,
        aspect: liveAspect,
        tourSlug: options.tourSlug,
        capturedAt: new Date().toISOString(),
      },
    };
  } finally {
    gl.setRenderTarget(previousTarget);
    gl.autoClear = previousAutoClear;
    target.dispose();
    gl.render(scene, camera);
  }
}
