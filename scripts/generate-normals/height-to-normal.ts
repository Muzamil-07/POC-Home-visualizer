import sharp from "sharp";

export type NormalMapOptions = {
  strength: number;
  blur: number;
  maxSize: number;
  invertHeight: boolean;
};

/**
 * Convert an sRGB base-color image into a tangent-space OpenGL normal map PNG.
 * Flat normals encode near [128, 128, 255]. Alpha is ignored for height.
 */
export async function generateNormalMapPng(
  inputBytes: Uint8Array,
  options: NormalMapOptions,
): Promise<{ png: Buffer; width: number; height: number }> {
  const meta = await sharp(inputBytes, { failOn: "none" }).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW < 2 || srcH < 2) {
    throw new Error("Image too small for normal-map generation");
  }

  const maxSize = Math.max(64, Math.floor(options.maxSize));
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH));
  const width = Math.max(2, Math.round(srcW * scale));
  const height = Math.max(2, Math.round(srcH * scale));

  let pipeline = sharp(inputBytes, { failOn: "none" }).ensureAlpha().resize(width, height, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3,
  });

  // Mild blur on the colour image before luminance extraction reduces chroma noise.
  if (options.blur > 0) {
    const sigma = Math.max(0.3, Math.min(8, options.blur));
    pipeline = pipeline.blur(sigma);
  }

  const { data, info } = await pipeline
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const channels = info.channels;
  if (channels < 3) {
    throw new Error(`Unexpected channel count: ${channels}`);
  }

  const heightMap = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * channels;
    const r = srgbToLinear(data[o]! / 255);
    const g = srgbToLinear(data[o + 1]! / 255);
    const b = srgbToLinear(data[o + 2]! / 255);
    // Rec. 709 luminance as a height proxy.
    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (options.invertHeight) lum = 1 - lum;
    heightMap[i] = lum;
  }

  const strength = Math.max(0.01, options.strength);
  const out = Buffer.alloc(w * h * 3);
  let deviationSum = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const tl = heightAt(heightMap, w, h, x - 1, y - 1);
      const t = heightAt(heightMap, w, h, x, y - 1);
      const tr = heightAt(heightMap, w, h, x + 1, y - 1);
      const l = heightAt(heightMap, w, h, x - 1, y);
      const r = heightAt(heightMap, w, h, x + 1, y);
      const bl = heightAt(heightMap, w, h, x - 1, y + 1);
      const btm = heightAt(heightMap, w, h, x, y + 1);
      const br = heightAt(heightMap, w, h, x + 1, y + 1);

      // Sobel gradient. OpenGL: +X right, +Y up, +Z toward viewer.
      const dx = -tl - 2 * l - bl + tr + 2 * r + br;
      const dy = -tl - 2 * t - tr + bl + 2 * btm + br;

      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      deviationSum += Math.abs(nx) + Math.abs(ny);

      const i = (y * w + x) * 3;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }

  const meanDeviation = deviationSum / (w * h);
  // Solid-colour bases produce a flat [128,128,255] map that only bloats the GLB.
  if (meanDeviation < 0.002) {
    throw new FlatNormalError(
      `Base colour has negligible height variation (mean XY deviation ${meanDeviation.toFixed(5)}); skipping flat normal.`,
    );
  }

  const png = await sharp(out, {
    raw: { width: w, height: h, channels: 3 },
  })
    .png({ compressionLevel: 9, effort: 7 })
    .toBuffer();

  return { png, width: w, height: h };
}

export class FlatNormalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlatNormalError";
  }
}

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function heightAt(
  map: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
) {
  const cx = Math.min(w - 1, Math.max(0, x));
  const cy = Math.min(h - 1, Math.max(0, y));
  return map[cy * w + cx]!;
}
