import { getMaxImageBytes } from "@/lib/server/env";

export class ImageInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageInputError";
  }
}

export type ValidatedImage = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png";
};

function imageTypeFor(bytes: Uint8Array): ValidatedImage["contentType"] | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  return null;
}

function validateImage(bytes: Uint8Array, maximumBytes = getMaxImageBytes()): ValidatedImage {
  if (!bytes.length) throw new ImageInputError("Choose an image before continuing.");
  if (bytes.length > maximumBytes) {
    throw new ImageInputError("Images must be 5 MB or smaller.");
  }

  const contentType = imageTypeFor(bytes);
  if (!contentType) {
    throw new ImageInputError("Use a JPEG or PNG image.");
  }

  return { bytes, contentType };
}

export async function imageFromFormFile(value: FormDataEntryValue | null): Promise<ValidatedImage> {
  if (!value || typeof value === "string") {
    throw new ImageInputError("A camera image is required.");
  }

  if (value.size > getMaxImageBytes()) {
    throw new ImageInputError("Images must be 5 MB or smaller.");
  }

  return validateImage(new Uint8Array(await value.arrayBuffer()));
}

function isUnsafeRemoteHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "169.254.169.254"
  ) {
    return true;
  }

  return (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^0\./.test(host)
  );
}

/** Fetches an enrollment image without following redirects to private networks. */
export async function imageFromRemoteUrl(rawUrl: string): Promise<ValidatedImage> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ImageInputError("The face_image_url is not a valid URL.");
  }

  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    isUnsafeRemoteHost(url.hostname)
  ) {
    throw new ImageInputError("The face_image_url is not an allowed image address.");
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: abortController.signal,
      headers: { Accept: "image/jpeg,image/png" },
    });
    if (!response.ok) {
      throw new ImageInputError("The reference image could not be downloaded.");
    }

    const maximumBytes = getMaxImageBytes();
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > maximumBytes) {
      throw new ImageInputError("Reference images must be 5 MB or smaller.");
    }

    return validateImage(new Uint8Array(await response.arrayBuffer()), maximumBytes);
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    throw new ImageInputError("The reference image could not be downloaded.");
  } finally {
    clearTimeout(timeout);
  }
}

