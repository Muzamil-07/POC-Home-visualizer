import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_HOUSE_OBJECT,
  GENERATED_NORMALS_OBJECT,
  MODELS_BUCKET,
  publicStorageObjectUrl,
} from "../src/lib/model-storage";

const allFiles = [
  {
    id: "original",
    local: path.join(
      process.cwd(),
      "public",
      "Lucas Home - Full Color (2) (1).glb",
    ),
    object: DEFAULT_HOUSE_OBJECT,
    label: "original house",
  },
  {
    id: "generated",
    local: path.join(
      process.cwd(),
      "public",
      "models",
      "house-with-generated-normals.glb",
    ),
    object: GENERATED_NORMALS_OBJECT,
    label: "generated-normals house",
  },
];

const only = process.argv.includes("--only=original")
  ? "original"
  : process.argv.includes("--only=generated")
    ? "generated"
    : null;
const files = only ? allFiles.filter((file) => file.id === only) : allFiles;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local before uploading.`);
  }
  return value;
}

async function main() {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Couldn't list Storage buckets: ${listError.message}`);
  }
  if (!buckets?.some((bucket) => bucket.name === MODELS_BUCKET)) {
    const { error: createError } = await supabase.storage.createBucket(
      MODELS_BUCKET,
      {
        public: true,
        allowedMimeTypes: ["model/gltf-binary", "application/octet-stream"],
      },
    );
    if (createError) {
      throw new Error(`Couldn't create ${MODELS_BUCKET}: ${createError.message}`);
    }
    console.log(`Created public bucket ${MODELS_BUCKET}`);
  }

  for (const file of files) {
    if (!existsSync(file.local)) {
      throw new Error(`Local file missing: ${file.local}`);
    }
    const bytes = statSync(file.local).size;
    console.log(`Uploading ${file.label} (${(bytes / 1024 / 1024).toFixed(1)} MB) → ${file.object}`);
    const body = await readFile(file.local);
    const { error } = await supabase.storage.from(MODELS_BUCKET).upload(
      file.object,
      body,
      {
        contentType: "model/gltf-binary",
        upsert: true,
      },
    );
    if (error) {
      throw new Error(`${file.label} upload failed: ${error.message}`);
    }
    console.log(`  ${publicStorageObjectUrl(MODELS_BUCKET, file.object)}`);
  }

  console.log("Default house models are in the tour-models bucket.");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
