import { requireEnvironment } from "@/lib/server/env";
import type { ValidatedImage } from "@/lib/server/images";

type CloudinaryAsset = {
  publicId: string;
  version: string | null;
};

function asHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

async function cloudinarySignature(parameters: Record<string, string>): Promise<string> {
  const apiSecret = requireEnvironment("CLOUDINARY_API_SECRET");
  const payload = `${Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")}${apiSecret}`;
  return asHex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(payload)));
}

function config() {
  return {
    cloudName: requireEnvironment("CLOUDINARY_CLOUD_NAME"),
    apiKey: requireEnvironment("CLOUDINARY_API_KEY"),
    folder: requireEnvironment("CLOUDINARY_FOLDER"),
  };
}

export async function uploadReferenceImage(image: ValidatedImage): Promise<CloudinaryAsset> {
  const { cloudName, apiKey, folder } = config();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = `reference-${crypto.randomUUID()}`;
  const signed = {
    folder,
    public_id: publicId,
    timestamp,
    type: "authenticated",
  };
  const formData = new FormData();
  // Make an owned ArrayBuffer: TypeScript correctly refuses a generic
  // Uint8Array<ArrayBufferLike> as a BlobPart because it could theoretically
  // be backed by SharedArrayBuffer.
  const imageBuffer = new Uint8Array(image.bytes).buffer as ArrayBuffer;
  formData.set("file", new Blob([imageBuffer], { type: image.contentType }), "reference-image");
  formData.set("api_key", apiKey);
  for (const [key, value] of Object.entries(signed)) formData.set(key, value);
  formData.set("signature", await cloudinarySignature(signed));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });
  const body = (await response.json().catch(() => null)) as
    | { public_id?: string; version?: string | number; error?: { message?: string } }
    | null;

  if (!response.ok || !body?.public_id) {
    throw new Error(body?.error?.message ?? "Cloudinary could not store the reference image.");
  }

  return {
    publicId: body.public_id,
    version: body.version ? String(body.version) : null,
  };
}

/** Best-effort cleanup; never let a cleanup failure hide the original error. */
export async function deleteReferenceImage(publicId: string | null | undefined): Promise<void> {
  if (!publicId) return;
  try {
    const { cloudName, apiKey } = config();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signed = { public_id: publicId, timestamp, type: "authenticated" };
    const formData = new FormData();
    formData.set("api_key", apiKey);
    for (const [key, value] of Object.entries(signed)) formData.set(key, value);
    formData.set("signature", await cloudinarySignature(signed));
    await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: "POST",
      body: formData,
    });
  } catch {
    // The current database row retains the asset id for later manual cleanup.
  }
}

