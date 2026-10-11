import {
  getMatchMargin,
  getMatchThreshold,
  requireEnvironment,
} from "@/lib/server/env";
import type { ValidatedImage } from "@/lib/server/images";

type RekognitionConfiguration = {
  accessKeyId: string;
  collectionId: string;
  region: string;
  secretAccessKey: string;
};

type FaceMatch = {
  Face?: { FaceId?: string };
  Similarity?: number;
};

const encoder = new TextEncoder();

function rekognition(): RekognitionConfiguration {
  return {
    accessKeyId: requireEnvironment("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requireEnvironment("AWS_SECRET_ACCESS_KEY"),
    collectionId: requireEnvironment("AWS_REKOGNITION_COLLECTION_ID"),
    region: requireEnvironment("AWS_REGION"),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmac(key: BufferSource, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
}

async function signedRequest<T>(operation: string, payload: object): Promise<T> {
  const config = rekognition();
  const host = `rekognition.${config.region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  const body = JSON.stringify(payload);
  const payloadHash = await sha256(body);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const target = `RekognitionService.${operation}`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date;x-amz-target";
  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${config.region}/rekognition/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256(canonicalRequest)}`;
  const dateKey = await hmac(encoder.encode(`AWS4${config.secretAccessKey}`), dateStamp);
  const regionKey = await hmac(dateKey, config.region);
  const serviceKey = await hmac(regionKey, "rekognition");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": amzDate,
      "X-Amz-Target": target,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  const result = (await response.json().catch(() => ({}))) as T & {
    Message?: string;
    message?: string;
  };
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(`AWS access is missing rekognition:${operation} permission.`);
    }
    throw new Error(result.Message ?? result.message ?? `Rekognition request failed (${response.status}).`);
  }
  return result;
}

export type FaceSearchResult =
  | { kind: "match"; faceId: string }
  | { kind: "no_face" | "multiple_faces" | "no_match" | "ambiguous" };

async function faceCount(image: ValidatedImage): Promise<number> {
  const response = await signedRequest<{ FaceDetails?: unknown[] }>("DetectFaces", {
    Image: { Bytes: bytesToBase64(image.bytes) },
    Attributes: ["DEFAULT"],
  });
  return response.FaceDetails?.length ?? 0;
}

export async function searchFace(image: ValidatedImage): Promise<FaceSearchResult> {
  const count = await faceCount(image);
  if (!count) return { kind: "no_face" };
  if (count > 1) return { kind: "multiple_faces" };

  const { collectionId } = rekognition();
  const response = await signedRequest<{ FaceMatches?: FaceMatch[] }>("SearchFacesByImage", {
    CollectionId: collectionId,
    Image: { Bytes: bytesToBase64(image.bytes) },
    FaceMatchThreshold: getMatchThreshold(),
    MaxFaces: 2,
    QualityFilter: "AUTO",
  });
  const matches = response.FaceMatches ?? [];
  const first = matches[0];
  if (!first?.Face?.FaceId || first.Similarity === undefined) return { kind: "no_match" };
  const second = matches[1];
  if (
    second?.Similarity !== undefined &&
    first.Similarity - second.Similarity < getMatchMargin()
  ) {
    return { kind: "ambiguous" };
  }
  return { kind: "match", faceId: first.Face.FaceId };
}

async function externalImageId(externalId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(externalId));
  return `facecheck-${hex(digest)}`;
}

export async function indexFace(
  image: ValidatedImage,
  userExternalId: string,
): Promise<{ faceId: string; externalImageId: string }> {
  const count = await faceCount(image);
  if (!count) throw new Error("No face was found in the reference image.");
  if (count > 1) throw new Error("Reference images must contain exactly one face.");

  const { collectionId } = rekognition();
  const id = await externalImageId(userExternalId);
  const response = await signedRequest<{
    FaceRecords?: Array<{ Face?: { FaceId?: string } }>;
  }>("IndexFaces", {
    CollectionId: collectionId,
    Image: { Bytes: bytesToBase64(image.bytes) },
    ExternalImageId: id,
    MaxFaces: 1,
    QualityFilter: "AUTO",
    DetectionAttributes: ["DEFAULT"],
  });
  const faceId = response.FaceRecords?.[0]?.Face?.FaceId;
  if (!faceId) throw new Error("Rekognition could not enroll a usable face from that image.");
  return { faceId, externalImageId: id };
}

export async function deleteIndexedFace(faceId: string | null | undefined): Promise<void> {
  if (!faceId) return;
  try {
    const { collectionId } = rekognition();
    await signedRequest("DeleteFaces", { CollectionId: collectionId, FaceIds: [faceId] });
  } catch {
    // Cleanup is best-effort after the new record is already active.
  }
}
