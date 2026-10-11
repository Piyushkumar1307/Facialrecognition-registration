import { NextRequest } from "next/server";
import { requestUser } from "@/lib/server/auth";
import { userForFaceId } from "@/lib/server/database";
import { AppConfigurationError } from "@/lib/server/env";
import { hasSameOrigin, noStoreJson } from "@/lib/server/http";
import { ImageInputError, imageFromFormFile } from "@/lib/server/images";
import { searchFace } from "@/lib/server/rekognition";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return noStoreJson({ error: "This request must come from FaceCheck." }, { status: 403 });
  }
  if (!(await requestUser())) {
    return noStoreJson({ error: "Sign in before scanning." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const result = await searchFace(await imageFromFormFile(formData.get("image")));
    if (result.kind !== "match") {
      return noStoreJson({ matched: false, reason: result.kind });
    }

    const user = await userForFaceId(result.faceId);
    if (!user) return noStoreJson({ matched: false, reason: "no_match" });

    return noStoreJson({
      matched: true,
      user: {
        externalId: user.externalId,
        fullName: user.fullName,
        email: user.email,
        department: user.department,
        role: user.role,
      },
    });
  } catch (error) {
    if (error instanceof ImageInputError) {
      return noStoreJson({ error: error.message }, { status: 400 });
    }
    if (error instanceof AppConfigurationError) {
      return noStoreJson(
        { error: "Face matching is not configured yet. Ask an administrator to finish setup." },
        { status: 503 },
      );
    }
    console.error("Face scan request failed", error instanceof Error ? error.name : "UnknownError");
    return noStoreJson({ error: "We could not complete the face check. Please try again." }, { status: 502 });
  }
}

