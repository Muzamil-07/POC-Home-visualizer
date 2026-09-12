export const MODELS_BUCKET = "tour-models";
export const DEFAULT_HOUSE_OBJECT = "defaults/lucas-home-full-color.glb";
export const GENERATED_NORMALS_OBJECT =
  "defaults/house-with-generated-normals.glb";
export const MAX_MODEL_UPLOAD_BYTES = 512 * 1024 * 1024;

export function supabaseProjectUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
}

export function publicStorageObjectUrl(bucket: string, objectPath: string) {
  const base = supabaseProjectUrl();
  if (!base || !objectPath) return null;
  return `${base}/storage/v1/object/public/${bucket}/${objectPath.replace(
    /^\/+/,
    "",
  )}`;
}

export function defaultHouseStorageUrl() {
  const override = process.env.NEXT_PUBLIC_DEFAULT_HOUSE_URL?.trim();
  if (override) return override;
  return publicStorageObjectUrl(MODELS_BUCKET, DEFAULT_HOUSE_OBJECT);
}

export function generatedNormalsStorageUrl() {
  const override = process.env.NEXT_PUBLIC_GENERATED_NORMALS_HOUSE_URL?.trim();
  if (override) return override;
  return publicStorageObjectUrl(MODELS_BUCKET, GENERATED_NORMALS_OBJECT);
}

export function isTourModelsPublicUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes(
      `/storage/v1/object/public/${MODELS_BUCKET}/`,
    );
  } catch {
    return url.includes(`/storage/v1/object/public/${MODELS_BUCKET}/`);
  }
}

export function encodeModelUrl(url: string) {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  ) {
    return url;
  }
  return encodeURI(url);
}

export function sanitizeModelFilename(name: string) {
  const base = name.split(/[/\\]/).pop()?.trim() || "model.glb";
  const withExt = base.toLowerCase().endsWith(".glb") ? base : `${base}.glb`;
  const safe = withExt
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/-\.glb$/i, ".glb")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (safe.toLowerCase() === "glb" || safe.length < 5) return "model.glb";
  return safe.slice(0, 120);
}

export function uploadedModelObjectPath(filename: string) {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `uploads/${id}/${sanitizeModelFilename(filename)}`;
}
