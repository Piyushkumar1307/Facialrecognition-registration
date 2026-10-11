import {
  DeleteFacesCommand,
  DetectFacesCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import {
  getMatchMargin,
  getMatchThreshold,
  requireEnvironment,
} from "@/lib/server/env";
import type { ValidatedImage } from "@/lib/server/images";

type RekognitionConfiguration = {
  collectionId: string;
  client: RekognitionClient;
};

function rekognition(): RekognitionConfiguration {
  const accessKeyId = requireEnvironment("AWS_ACCESS_KEY_ID");
  const secretAccessKey = requireEnvironment("AWS_SECRET_ACCESS_KEY");
  return {
    collectionId: requireEnvironment("AWS_REKOGNITION_COLLECTION_ID"),
    client: new RekognitionClient({
      region: requireEnvironment("AWS_REGION"),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  };
}

export type FaceSearchResult =
  | { kind: "match"; faceId: string }
  | { kind: "no_face" | "multiple_faces" | "no_match" | "ambiguous" };

async function faceCount(image: ValidatedImage): Promise<number> {
  const { client } = rekognition();
  const response = await client.send(
    new DetectFacesCommand({
      Image: { Bytes: image.bytes },
      Attributes: ["DEFAULT"],
    }),
  );
  return response.FaceDetails?.length ?? 0;
}

export async function searchFace(image: ValidatedImage): Promise<FaceSearchResult> {
  const count = await faceCount(image);
  if (!count) return { kind: "no_face" };
  if (count > 1) return { kind: "multiple_faces" };

  const { client, collectionId } = rekognition();
  const response = await client.send(
    new SearchFacesByImageCommand({
      CollectionId: collectionId,
      Image: { Bytes: image.bytes },
      FaceMatchThreshold: getMatchThreshold(),
      MaxFaces: 2,
      QualityFilter: "AUTO",
    }),
  );
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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(externalId));
  const token = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return `facecheck-${token}`;
}

export async function indexFace(
  image: ValidatedImage,
  userExternalId: string,
): Promise<{ faceId: string; externalImageId: string }> {
  const count = await faceCount(image);
  if (!count) throw new Error("No face was found in the reference image.");
  if (count > 1) throw new Error("Reference images must contain exactly one face.");

  const { client, collectionId } = rekognition();
  const id = await externalImageId(userExternalId);
  const response = await client.send(
    new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: image.bytes },
      ExternalImageId: id,
      MaxFaces: 1,
      QualityFilter: "AUTO",
      DetectionAttributes: ["DEFAULT"],
    }),
  );
  const faceId = response.FaceRecords?.[0]?.Face?.FaceId;
  if (!faceId) throw new Error("Rekognition could not enroll a usable face from that image.");
  return { faceId, externalImageId: id };
}

export async function deleteIndexedFace(faceId: string | null | undefined): Promise<void> {
  if (!faceId) return;
  try {
    const { client, collectionId } = rekognition();
    await client.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: [faceId] }));
  } catch {
    // Best effort: preserve the successful database update and surface stale
    // Rekognition records for cleanup rather than failing a user import.
  }
}

