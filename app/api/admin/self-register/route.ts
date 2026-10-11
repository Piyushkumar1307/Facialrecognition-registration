import { NextRequest } from "next/server";

import { hasAddUserAccessForRequest } from "@/lib/server/add-user-access";
import { requestUser } from "@/lib/server/auth";
import { ensureDatabaseSchema } from "@/lib/server/database";
import { AppConfigurationError } from "@/lib/server/env";
import { hasSameOrigin, noStoreJson } from "@/lib/server/http";
import { ImageInputError, imageFromFormFile } from "@/lib/server/images";
import { enrollCapturedUser } from "@/lib/server/import-users";

export const dynamic = "force-dynamic";

function formText(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return noStoreJson({ error: "This request must come from FaceCheck." }, { status: 403 });
  }
  if (!(await requestUser())) {
    return noStoreJson({ error: "Sign in before registering." }, { status: 401 });
  }
  if (!(await hasAddUserAccessForRequest(request))) {
    return noStoreJson({ error: "Enter the enrollment passcode before registering." }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const image = await imageFromFormFile(formData.get("image"));
    await ensureDatabaseSchema();
    const result = await enrollCapturedUser(
      {
        externalId: formText(formData, "externalId"),
        fullName: formText(formData, "fullName"),
        age: formText(formData, "age"),
        profession: formText(formData, "profession"),
        email: formText(formData, "email"),
        department: formText(formData, "department"),
        role: formText(formData, "role"),
      },
      image,
    );
    return noStoreJson({
      registered: true,
      externalId: result.externalId,
      status: result.status,
    });
  } catch (error) {
    if (error instanceof ImageInputError) {
      return noStoreJson({ error: error.message }, { status: 400 });
    }
    if (error instanceof AppConfigurationError) {
      return noStoreJson(
        { error: "Enrollment services are not configured yet. Ask an administrator to finish setup." },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "Registration could not be completed.";
    console.error("Self-registration failed", error instanceof Error ? error.name : "UnknownError");
    return noStoreJson({ error: message }, { status: 502 });
  }
}
