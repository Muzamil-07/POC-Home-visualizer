export type CliOptions = {
  input: string;
  output: string;
  strength: number;
  blur: number;
  maxSize: number;
  invertHeight: boolean;
  include: string[];
  exclude: string[];
  overwriteExistingNormals: boolean;
  diagnosticsDir: string;
  normalScale: number;
};

export type SkipReason =
  | "no-base-color-texture"
  | "unsupported-texture-format"
  | "ktx2-unsupported"
  | "already-has-normal"
  | "no-uv-coordinates"
  | "transparent-glass"
  | "unlit"
  | "emissive"
  | "name-excluded"
  | "cli-excluded"
  | "cli-not-included"
  | "empty-image"
  | "decode-failed"
  | "flat-height";

export type MaterialReport = {
  name: string;
  index: number;
  hasBaseColorTexture: boolean;
  hasNormalTexture: boolean;
  baseColorMimeType: string | null;
  baseColorWidth: number | null;
  baseColorHeight: number | null;
  baseColorTexCoord: number | null;
  primitivesWithMaterial: number;
  primitivesWithRequiredUv: number;
  missingUv: boolean;
  alphaMode: string;
  transparent: boolean;
  unlit: boolean;
  glassLike: boolean;
  emissive: boolean;
  transmission: number | null;
  action: "generate" | "reuse" | "skip" | "keep-existing";
  skipReason: SkipReason | null;
  generatedNormalPath: string | null;
  generatedWidth: number | null;
  generatedHeight: number | null;
  sharedCacheKey: string | null;
  warning: string | null;
};

export type GenerationReport = {
  generatedAt: string;
  input: string;
  output: string;
  settings: {
    strength: number;
    blur: number;
    maxSize: number;
    invertHeight: boolean;
    overwriteExistingNormals: boolean;
    normalScale: number;
    include: string[];
    exclude: string[];
  };
  inputBytes: number;
  outputBytes: number;
  materials: MaterialReport[];
  processedCount: number;
  skippedCount: number;
  reusedCount: number;
  unsupportedFormats: string[];
  warnings: string[];
};
