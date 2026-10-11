import { deleteReferenceImage, uploadReferenceImage } from "@/lib/server/cloudinary";
import {
  type EnrolledUser,
  saveUser,
  userForExternalId,
} from "@/lib/server/database";
import { imageFromRemoteUrl } from "@/lib/server/images";
import { deleteIndexedFace, indexFace } from "@/lib/server/rekognition";

export type ImportUserInput = {
  externalId?: unknown;
  fullName?: unknown;
  email?: unknown;
  department?: unknown;
  role?: unknown;
  faceImageUrl?: unknown;
  metadata?: unknown;
};

export type ImportRowResult = {
  externalId: string;
  status: "created" | "updated" | "saved_without_face" | "failed";
  message?: string;
};

type NormalizedImportUser = {
  externalId: string;
  fullName: string;
  email: string | null;
  department: string | null;
  role: string | null;
  faceImageUrl: string | null;
  metadata: Record<string, string>;
};

function text(value: unknown, field: string, maximum: number, required = false): string | null {
  if (value === null || value === undefined) {
    if (required) throw new Error(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const normalized = value.trim();
  if (!normalized) {
    if (required) throw new Error(`${field} is required.`);
    return null;
  }
  if (normalized.length > maximum) throw new Error(`${field} is too long.`);
  return normalized;
}

function metadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const values: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 30)) {
    if (typeof rawValue !== "string" && typeof rawValue !== "number" && typeof rawValue !== "boolean") {
      continue;
    }
    const key = rawKey.trim().slice(0, 80);
    const item = String(rawValue).trim().slice(0, 500);
    if (key && item) values[key] = item;
  }
  return values;
}

function normalize(input: ImportUserInput): NormalizedImportUser {
  const externalId = text(input.externalId, "externalId", 128, true)!;
  const fullName = text(input.fullName, "fullName", 160, true)!;
  const email = text(input.email, "email", 320);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("email is not valid.");
  }

  return {
    externalId,
    fullName,
    email,
    department: text(input.department, "department", 120),
    role: text(input.role, "role", 120),
    faceImageUrl: text(input.faceImageUrl, "faceImageUrl", 2_000),
    metadata: metadata(input.metadata),
  };
}

function withProfile(
  input: NormalizedImportUser,
  existing: EnrolledUser | null,
): EnrolledUser {
  return {
    externalId: input.externalId,
    fullName: input.fullName,
    email: input.email,
    department: input.department,
    role: input.role,
    cloudinaryPublicId: existing?.cloudinaryPublicId ?? null,
    cloudinaryVersion: existing?.cloudinaryVersion ?? null,
    rekognitionFaceId: existing?.rekognitionFaceId ?? null,
    rekognitionExternalImageId: existing?.rekognitionExternalImageId ?? null,
    metadata: { ...(existing?.metadata ?? {}), ...input.metadata },
    active: true,
  };
}

export async function importOneUser(input: ImportUserInput): Promise<ImportRowResult> {
  const record = normalize(input);
  const existing = await userForExternalId(record.externalId);
  const profile = withProfile(record, existing);

  if (!record.faceImageUrl) {
    await saveUser(profile);
    return {
      externalId: record.externalId,
      status: existing ? "updated" : "saved_without_face",
      ...(existing ? {} : { message: "Saved profile; no face reference was enrolled." }),
    };
  }

  const image = await imageFromRemoteUrl(record.faceImageUrl);
  const asset = await uploadReferenceImage(image);
  let indexed: Awaited<ReturnType<typeof indexFace>> | null = null;

  try {
    indexed = await indexFace(image, record.externalId);
    await saveUser({
      ...profile,
      cloudinaryPublicId: asset.publicId,
      cloudinaryVersion: asset.version,
      rekognitionFaceId: indexed.faceId,
      rekognitionExternalImageId: indexed.externalImageId,
    });
  } catch (error) {
    await deleteIndexedFace(indexed?.faceId);
    await deleteReferenceImage(asset.publicId);
    throw error;
  }

  // A replacement is active before its previous face/photo are removed, which
  // avoids temporarily making a user unmatchable during enrollment.
  if (existing?.rekognitionFaceId && existing.rekognitionFaceId !== indexed.faceId) {
    await deleteIndexedFace(existing.rekognitionFaceId);
  }
  if (existing?.cloudinaryPublicId && existing.cloudinaryPublicId !== asset.publicId) {
    await deleteReferenceImage(existing.cloudinaryPublicId);
  }

  return {
    externalId: record.externalId,
    status: existing ? "updated" : "created",
  };
}

