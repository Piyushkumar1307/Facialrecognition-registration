import { NextRequest } from "next/server";

import { addUserAccessCookie, verifyAddUserPasscode } from "@/lib/server/add-user-access";
import { requestUser } from "@/lib/server/auth";
import { hasSameOrigin, noStoreJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const MAX_PASSCODE_LENGTH = 256;

function passcodeFrom(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("passcode" in value)) return null;
  const passcode = (value as { passcode?: unknown }).passcode;
  if (typeof passcode !== "string" || !passcode.trim() || passcode.length > MAX_PASSCODE_LENGTH) {
    return null;
  }
  return passcode;
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return noStoreJson({ error: "This request must come from FaceCheck." }, { status: 403 });
  }
  if (!(await requestUser())) {
    return noStoreJson({ error: "Sign in before unlocking the importer." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ error: "Enter the add-user passcode." }, { status: 400 });
  }

  const passcode = passcodeFrom(payload);
  if (!passcode) return noStoreJson({ error: "Enter the add-user passcode." }, { status: 400 });

  if (!(await verifyAddUserPasscode(passcode))) {
    return noStoreJson({ error: "That passcode is not correct, or it has not been configured yet." }, { status: 401 });
  }

  const response = noStoreJson({ authorized: true });
  response.cookies.set(await addUserAccessCookie(request));
  return response;
}
