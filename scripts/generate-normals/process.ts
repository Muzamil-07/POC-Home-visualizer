import { copyFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  NodeIO,
  type Document,
  type Material,
  type Texture,
  type TextureInfo,
} from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureTransform } from "@gltf-transform/extensions";
import sharp from "sharp";
import type { CliOptions, GenerationReport, MaterialReport, SkipReason } from "./types";
import { generateNormalMapPng, FlatNormalError } from "./height-to-normal";
import { printConsoleReport, summarizeActions, writeReportJson } from "./report";
import {
  contentHash,
  ensureDir,
  isUnsuitableMaterialName,
  matchesAny,
  sanitizeFilename,
  writeBinary,
} from "./util";

const DECODABLE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

type CacheEntry = {
  texture: Texture;
  png: Uint8Array;
  width: number;
  height: number;
  diagnosticPath: string;
};

type TransformLike = {
  getOffset: () => [number, number];
  getScale: () => [number, number];
  getRotation: () => number;
  getTexCoord: () => number | null;
  setOffset: (v: [number, number]) => unknown;
  setScale: (v: [number, number]) => unknown;
  setRotation: (v: number) => unknown;
  setTexCoord: (v: number | null) => unknown;
};

export async function runGenerateNormals(options: CliOptions) {
  const inputStat = await stat(options.input);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  console.log(`Reading ${options.input}…`);
  const document = await io.read(options.input);
  document.createExtension(KHRTextureTransform);

  const baseColorDir = path.join(options.diagnosticsDir, "base-colors");
  const normalDir = path.join(options.diagnosticsDir, "normal-maps");
  await ensureDir(baseColorDir);
  await ensureDir(normalDir);

  const materials = document.getRoot().listMaterials();
  const settingsKey = JSON.stringify({
    strength: options.strength,
    blur: options.blur,
    maxSize: options.maxSize,
    invertHeight: options.invertHeight,
  });

  const cache = new Map<string, CacheEntry>();
  const flatCache = new Set<string>();
  const reports: MaterialReport[] = [];
  const unsupportedFormats = new Set<string>();
  const warnings: string[] = [];

  for (let index = 0; index < materials.length; index += 1) {
    const material = materials[index]!;
    const report = await processMaterial({
      document,
      material,
      index,
      options,
      settingsKey,
      cache,
      flatCache,
      baseColorDir,
      normalDir,
      unsupportedFormats,
      warnings,
    });
    reports.push(report);
  }

  console.log(`Writing ${options.output}…`);
  await ensureDir(path.dirname(options.output));
  await io.write(options.output, document);

  const inputAfter = await stat(options.input);
  if (inputAfter.size !== inputStat.size || inputAfter.mtimeMs !== inputStat.mtimeMs) {
    // Size must not change; mtime may change on some FS when reading — only fail on size.
    if (inputAfter.size !== inputStat.size) {
      throw new Error("Input GLB size changed unexpectedly — aborting.");
    }
  }

  const outputStat = await stat(options.output);
  const counts = summarizeActions(reports);
  const generationReport: GenerationReport = {
    generatedAt: new Date().toISOString(),
    input: options.input,
    output: options.output,
    settings: {
      strength: options.strength,
      blur: options.blur,
      maxSize: options.maxSize,
      invertHeight: options.invertHeight,
      overwriteExistingNormals: options.overwriteExistingNormals,
      normalScale: options.normalScale,
      include: options.include,
      exclude: options.exclude,
    },
    inputBytes: inputStat.size,
    outputBytes: outputStat.size,
    materials: reports,
    ...counts,
    unsupportedFormats: [...unsupportedFormats],
    warnings,
  };

  const reportPath = await writeReportJson(options.diagnosticsDir, generationReport);
  printConsoleReport(generationReport);
  console.log(`Wrote diagnostics report: ${reportPath}`);

  await copyFile(
    reportPath,
    path.join(
      path.dirname(options.output),
      `${path.basename(options.output, ".glb")}.report.json`,
    ),
  ).catch(() => undefined);

  return generationReport;
}

async function processMaterial(args: {
  document: Document;
  material: Material;
  index: number;
  options: CliOptions;
  settingsKey: string;
  cache: Map<string, CacheEntry>;
  flatCache: Set<string>;
  baseColorDir: string;
  normalDir: string;
  unsupportedFormats: Set<string>;
  warnings: string[];
}): Promise<MaterialReport> {
  const {
    document,
    material,
    index,
    options,
    settingsKey,
    cache,
    flatCache,
    baseColorDir,
    normalDir,
    unsupportedFormats,
    warnings,
  } = args;

  const name = material.getName() || `material_${index}`;
  const baseTexture = material.getBaseColorTexture();
  const baseInfo = material.getBaseColorTextureInfo();
  const existingNormal = material.getNormalTexture();
  const alphaMode = material.getAlphaMode();
  const emissive = material.getEmissiveFactor();
  const emissiveStrength = Math.max(emissive[0] ?? 0, emissive[1] ?? 0, emissive[2] ?? 0);
  const unlit = Boolean(material.getExtension("KHR_materials_unlit"));
  const transmissionExt = material.getExtension("KHR_materials_transmission") as
    | { getTransmissionFactor?: () => number }
    | null;
  const transmission =
    typeof transmissionExt?.getTransmissionFactor === "function"
      ? transmissionExt.getTransmissionFactor()
      : null;
  const nameUnsuitable = isUnsuitableMaterialName(name);
  const glassLike =
    nameUnsuitable ||
    (transmission !== null && transmission > 0.2) ||
    (alphaMode === "BLEND" && ((transmission ?? 0) > 0 || material.getAlpha() < 0.85));

  const uvStats = collectUvStats(document, material);
  const baseColorTexCoord = baseInfo?.getTexCoord() ?? null;

  const report: MaterialReport = {
    name,
    index,
    hasBaseColorTexture: Boolean(baseTexture),
    hasNormalTexture: Boolean(existingNormal),
    baseColorMimeType: null,
    baseColorWidth: null,
    baseColorHeight: null,
    baseColorTexCoord,
    primitivesWithMaterial: uvStats.primitives,
    primitivesWithRequiredUv: uvStats.withUv,
    missingUv: uvStats.primitives > 0 && uvStats.withUv < uvStats.primitives,
    alphaMode,
    transparent: alphaMode === "BLEND" || alphaMode === "MASK",
    unlit,
    glassLike,
    emissive: emissiveStrength > 0.15,
    transmission,
    action: "skip",
    skipReason: null,
    generatedNormalPath: null,
    generatedWidth: null,
    generatedHeight: null,
    sharedCacheKey: null,
    warning: null,
  };

  const skip = (reason: SkipReason, warning?: string): MaterialReport => {
    report.action = "skip";
    report.skipReason = reason;
    if (warning) {
      report.warning = warning;
      warnings.push(`${name}: ${warning}`);
    }
    return report;
  };

  if (options.include.length > 0 && !matchesAny(name, options.include)) {
    return skip("cli-not-included");
  }
  if (matchesAny(name, options.exclude)) {
    return skip("cli-excluded");
  }
  if (nameUnsuitable || glassLike) {
    return skip("transparent-glass");
  }
  if (unlit) return skip("unlit");
  if (report.emissive && emissiveStrength > 0.6) {
    return skip("emissive");
  }
  if (report.emissive) {
    report.warning =
      "Material has noticeable emissive factor; color-to-height normals may look incorrect.";
    warnings.push(`${name}: ${report.warning}`);
  }
  if (!baseTexture || !baseInfo) return skip("no-base-color-texture");
  if (existingNormal && !options.overwriteExistingNormals) {
    report.action = "keep-existing";
    report.skipReason = "already-has-normal";
    return report;
  }
  if (uvStats.primitives === 0 || report.missingUv) {
    return skip("no-uv-coordinates");
  }

  const imageBytes = baseTexture.getImage();
  const mime = (baseTexture.getMimeType() || "").toLowerCase();
  report.baseColorMimeType = mime || null;

  if (!imageBytes || imageBytes.byteLength === 0) {
    return skip("empty-image");
  }
  if (mime.includes("ktx") || mime === "image/ktx2") {
    unsupportedFormats.add(mime || "image/ktx2");
    return skip(
      "ktx2-unsupported",
      "KTX2/Basis textures are not decoded by this tool; skipped with an explicit report.",
    );
  }
  if (mime && !DECODABLE_MIME.has(mime)) {
    unsupportedFormats.add(mime);
    return skip("unsupported-texture-format", `Unsupported MIME type: ${mime}`);
  }

  try {
    const meta = await sharp(imageBytes, { failOn: "none" }).metadata();
    report.baseColorWidth = meta.width ?? null;
    report.baseColorHeight = meta.height ?? null;
  } catch (error) {
    return skip(
      "decode-failed",
      `Could not read base-color image metadata: ${(error as Error).message}`,
    );
  }

  const safeName = sanitizeFilename(name, `material_${index}`);
  const baseExt =
    mime.includes("jpeg") || mime.includes("jpg")
      ? "jpg"
      : mime.includes("webp")
        ? "webp"
        : "png";
  await writeBinary(path.join(baseColorDir, `${safeName}.${baseExt}`), imageBytes);

  const cacheKey = contentHash(imageBytes, settingsKey);
  report.sharedCacheKey = cacheKey;

  if (flatCache.has(cacheKey)) {
    return skip(
      "flat-height",
      "Shared base colour previously produced a flat normal map.",
    );
  }

  const cached = cache.get(cacheKey);
  if (cached) {
    attachNormalTexture(document, material, cached.texture, baseInfo, options.normalScale);
    report.action = "reuse";
    report.generatedNormalPath = cached.diagnosticPath;
    report.generatedWidth = cached.width;
    report.generatedHeight = cached.height;
    report.hasNormalTexture = true;
    return report;
  }

  try {
    const generated = await generateNormalMapPng(imageBytes, {
      strength: options.strength,
      blur: options.blur,
      maxSize: options.maxSize,
      invertHeight: options.invertHeight,
    });

    const normalDiagPath = path.join(normalDir, `${safeName}.png`);
    await writeBinary(normalDiagPath, generated.png);

    if (
      report.baseColorWidth &&
      report.baseColorHeight &&
      (generated.width < report.baseColorWidth * 0.5 ||
        generated.height < report.baseColorHeight * 0.5)
    ) {
      const warning = `Generated normal resized from ${report.baseColorWidth}×${report.baseColorHeight} to ${generated.width}×${generated.height} (max-size ${options.maxSize}).`;
      report.warning = warning;
      warnings.push(`${name}: ${warning}`);
    }

    const texture = document
      .createTexture(`${name}__generated_normal`)
      .setMimeType("image/png")
      .setImage(generated.png);

    attachNormalTexture(document, material, texture, baseInfo, options.normalScale);

    cache.set(cacheKey, {
      texture,
      png: generated.png,
      width: generated.width,
      height: generated.height,
      diagnosticPath: normalDiagPath,
    });

    report.action = "generate";
    report.generatedNormalPath = normalDiagPath;
    report.generatedWidth = generated.width;
    report.generatedHeight = generated.height;
    report.hasNormalTexture = true;
    return report;
  } catch (error) {
    if (error instanceof FlatNormalError) {
      flatCache.add(cacheKey);
      return skip("flat-height", error.message);
    }
    return skip("decode-failed", `Normal generation failed: ${(error as Error).message}`);
  }
}

function attachNormalTexture(
  document: Document,
  material: Material,
  texture: Texture,
  baseInfo: TextureInfo,
  normalScale: number,
) {
  material.setNormalTexture(texture);
  material.setNormalScale(normalScale);
  const normalInfo = material.getNormalTextureInfo();
  if (!normalInfo) return;

  normalInfo.setTexCoord(baseInfo.getTexCoord());
  normalInfo.setWrapS(baseInfo.getWrapS());
  normalInfo.setWrapT(baseInfo.getWrapT());
  const mag = baseInfo.getMagFilter();
  const min = baseInfo.getMinFilter();
  if (mag != null) normalInfo.setMagFilter(mag);
  if (min != null) normalInfo.setMinFilter(min);

  copyTextureTransform(document, baseInfo, normalInfo);
}

function copyTextureTransform(
  document: Document,
  sourceInfo: TextureInfo,
  targetInfo: TextureInfo,
) {
  const source = sourceInfo.getExtension("KHR_texture_transform") as TransformLike | null;
  if (!source) return;

  const extension = document.createExtension(KHRTextureTransform);
  const target =
    (targetInfo.getExtension("KHR_texture_transform") as TransformLike | null) ??
    extension.createTransform();

  target.setOffset(source.getOffset());
  target.setScale(source.getScale());
  target.setRotation(source.getRotation());
  target.setTexCoord(source.getTexCoord());
  targetInfo.setExtension("KHR_texture_transform", target as never);
}

function collectUvStats(document: Document, material: Material) {
  let primitives = 0;
  let withUv = 0;
  const texCoord = material.getBaseColorTextureInfo()?.getTexCoord() ?? 0;
  const attr = texCoord === 0 ? "TEXCOORD_0" : `TEXCOORD_${texCoord}`;

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMaterial() !== material) continue;
      primitives += 1;
      if (primitive.getAttribute(attr)) withUv += 1;
    }
  }
  return { primitives, withUv };
}
