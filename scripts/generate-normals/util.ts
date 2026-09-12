import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UNSUITABLE_NAME =
  /\b(glass|window|mirror|screen|light|emissive|water|glow|lamp|bulb|neon)\b/i;

export function sanitizeFilename(name: string, fallback = "material") {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

export function matchesAny(name: string, patterns: string[]) {
  if (patterns.length === 0) return false;
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(name);
    } catch {
      return name.toLowerCase().includes(pattern.toLowerCase());
    }
  });
}

export function isUnsuitableMaterialName(name: string) {
  return UNSUITABLE_NAME.test(name);
}

export function contentHash(bytes: Uint8Array, settingsKey: string) {
  return createHash("sha256")
    .update(bytes)
    .update("|")
    .update(settingsKey)
    .digest("hex")
    .slice(0, 16);
}

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export async function writeBinary(filePath: string, data: Uint8Array) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, data);
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 1 : 2)} ${units[unit]}`;
}

export function pad(value: string, width: number) {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}
