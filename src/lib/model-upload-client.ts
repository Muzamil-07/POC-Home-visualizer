import { formatBytes, isGlbFileName } from "@/components/viewer/glb";
import { MAX_MODEL_UPLOAD_BYTES } from "@/lib/model-storage";

export type ModelUploadResult = {
  publicUrl: string;
  path: string;
  filename: string;
  byteSize: number;
};

type SignedUploadResponse = {
  path: string;
  token: string;
  signedUrl: string;
  publicUrl: string;
  filename: string;
  error?: string;
};

export async function uploadModelToBucket(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<ModelUploadResult> {
  if (!isGlbFileName(file.name)) {
    throw new Error("Only .glb files are supported.");
  }
  if (file.size > MAX_MODEL_UPLOAD_BYTES) {
    throw new Error(
      `This model is ${formatBytes(file.size)}. The upload limit is ${formatBytes(MAX_MODEL_UPLOAD_BYTES)}.`,
    );
  }

  const intent = await fetch("/api/models/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, byteSize: file.size }),
  });
  const payload = (await intent.json().catch(() => null)) as
    | SignedUploadResponse
    | null;
  if (!intent.ok || !payload?.signedUrl || !payload.publicUrl) {
    throw new Error(payload?.error || "Couldn't start the model upload.");
  }

  await putFileToSignedUrl(payload.signedUrl, payload.token, file, onProgress);

  return {
    publicUrl: payload.publicUrl,
    path: payload.path,
    filename: payload.filename,
    byteSize: file.size,
  };
}

function putFileToSignedUrl(
  signedUrl: string,
  token: string,
  file: File,
  onProgress?: (ratio: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "model/gltf-binary",
    );
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.min(1, event.loaded / Math.max(event.total, 1)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(
        new Error(
          xhr.responseText
            ? `Couldn't upload this model (${xhr.status}).`
            : "Couldn't upload this model.",
        ),
      );
    };
    xhr.onerror = () => {
      reject(new Error("Couldn't reach Supabase Storage to upload this model."));
    };
    xhr.send(file);
  });
}
