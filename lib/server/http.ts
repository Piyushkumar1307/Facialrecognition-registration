import { NextRequest, NextResponse } from "next/server";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export function noStoreJson<T>(body: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

/** Cookie-authenticated API routes accept browser writes from only this origin. */
export function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const requestOrigin = new URL(request.url).origin;
    const allowedOrigins = new Set([requestOrigin]);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host")?.trim();
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : new URL(request.url).protocol.replace(":", "");

    // Reverse proxies such as Render terminate public HTTPS before forwarding
    // to the local Worker, so request.url may contain an internal origin.
    if (host && !/[\s/@\\]/.test(host)) {
      allowedOrigins.add(new URL(`${protocol}://${host}`).origin);
    }
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function messageForUnknownError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "We could not complete that request.";
}

