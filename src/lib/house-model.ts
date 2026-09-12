import { createModelIdentity } from "@/types/tour";
import {
  DEFAULT_HOUSE_OBJECT,
  defaultHouseStorageUrl,
  encodeModelUrl,
  generatedNormalsStorageUrl,
  GENERATED_NORMALS_OBJECT,
} from "@/lib/model-storage";

export const DEFAULT_HOUSE_MODEL_FILENAME =
  "Lucas Home - Full Color (2) (1).glb";

export const DEFAULT_HOUSE_MODEL_PATH = `/${DEFAULT_HOUSE_MODEL_FILENAME}`;

export const GENERATED_NORMALS_HOUSE_FILENAME = "house-with-generated-normals.glb";
export const GENERATED_NORMALS_HOUSE_PATH = `/models/${GENERATED_NORMALS_HOUSE_FILENAME}`;

export type HouseNormalsVariant = "original" | "generated";

export function houseModelPathForNormals(variant: HouseNormalsVariant) {
  if (variant === "generated") {
    return generatedNormalsStorageUrl() ?? GENERATED_NORMALS_HOUSE_PATH;
  }
  return defaultHouseStorageUrl() || DEFAULT_HOUSE_MODEL_PATH;
}

export function houseModelUrlForNormals(variant: HouseNormalsVariant) {
  return encodeModelUrl(houseModelPathForNormals(variant));
}

export function isHouseNormalsModelUrl(url: string) {
  const decoded = decodeURIComponent(url);
  const remote = defaultHouseStorageUrl();
  return (
    decoded.includes(GENERATED_NORMALS_HOUSE_FILENAME) ||
    decoded.includes(DEFAULT_HOUSE_MODEL_FILENAME) ||
    decoded.includes(GENERATED_NORMALS_OBJECT) ||
    decoded.includes(DEFAULT_HOUSE_OBJECT) ||
    Boolean(remote && decoded === decodeURIComponent(remote))
  );
}

export function resolveHouseModelUrl(
  url: string,
  variant: HouseNormalsVariant = "original",
) {
  if (!isHouseNormalsModelUrl(url)) return url;
  return houseModelUrlForNormals(variant);
}

export function publishedHouseModelUrl(url: string) {
  if (!url || url.startsWith("blob:") || url.startsWith("file:")) return url;
  if (isHouseNormalsModelUrl(url)) {
    return houseModelUrlForNormals("original");
  }
  return encodeModelUrl(url);
}

export const DEFAULT_HOUSE_MODEL_URL = houseModelUrlForNormals("original");

export const DEFAULT_HOUSE_FILE_SIZE = 200_042_900;

export const DEFAULT_HOUSE_IDENTITY = {
  filename: DEFAULT_HOUSE_MODEL_FILENAME,
  fileSize: DEFAULT_HOUSE_FILE_SIZE,
  lastModified: 1,
} as const;

export const DEFAULT_HOUSE_MODEL_ID = createModelIdentity(DEFAULT_HOUSE_IDENTITY);

export const CURATED_TOUR_URL = "/tours/curated-house-tour.json";

export const CURATED_TOUR_DWELL_MS = 2500;
export const CURATED_TOUR_MOVE_SPEED = 1.35;
export const CURATED_TOUR_FADE_MS = 320;

export function isDefaultHouseFilename(filename: string | null | undefined) {
  return (
    (filename ?? "").trim().toLowerCase() ===
    DEFAULT_HOUSE_MODEL_FILENAME.toLowerCase()
  );
}

export function isDefaultHouseModelId(modelId: string | null | undefined) {
  return modelId === DEFAULT_HOUSE_MODEL_ID;
}
