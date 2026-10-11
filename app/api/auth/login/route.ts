import { NextRequest } from "next/server";

import { hasSameOrigin, noStoreJson } from "@/lib/server/http";
import {
  safeReturnPath,
  siteAccessCookie,
  verifySitePasscode,
} from "@/lib/server/site-access";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return noStoreJson({ error: "This request must come from FaceCheck." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Enter the site passcode." }, { status: 400 });
  }
  const value =
    body && typeof body === "object" && "passcode" in body
      ? (body as { passcode?: unknown }).passcode
      : null;
  const returnTo =
    body && typeof body === "object" && "returnTo" in body
      ? (body as { returnTo?: unknown }).returnTo
      : null;
  if (typeof value !== "string" || !value.trim() || value.length > 256) {
    return noStoreJson({ error: "Enter the site passcode." }, { status: 400 });
  }
  if (!(await verifySitePasscode(value))) {
    return noStoreJson(
      { error: "That passcode is incorrect, or SITE_PASSCODE is not configured." },
      { status: 401 },
    );
  }
  const response = noStoreJson({
    authorized: true,
    returnTo: safeReturnPath(typeof returnTo === "string" ? returnTo : "/"),
  });
  response.cookies.set(await siteAccessCookie(request));
  return response;
}
