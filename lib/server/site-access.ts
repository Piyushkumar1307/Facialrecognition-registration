import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { readEnvironment } from "@/lib/server/env";

export const SITE_ACCESS_COOKIE = "facecheck_site_access";
const COOKIE_LIFETIME_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();
const tokenMessage = encoder.encode("facecheck:site-access:v1");

function configuredPasscode(): string | undefined {
  return readEnvironment("SITE_PASSCODE");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const maximumLength = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < maximumLength; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function tokenFor(passcode: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passcode),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, tokenMessage)));
}

export async function verifySitePasscode(candidate: string): Promise<boolean> {
  const passcode = configuredPasscode();
  return Boolean(passcode && constantTimeEqual(candidate.trim(), passcode));
}

async function hasAccessValue(value: string | undefined): Promise<boolean> {
  const passcode = configuredPasscode();
  if (!passcode || !value) return false;
  return constantTimeEqual(value, await tokenFor(passcode));
}

export async function hasSiteAccess(): Promise<boolean> {
  const cookieStore = await cookies();
  return hasAccessValue(cookieStore.get(SITE_ACCESS_COOKIE)?.value);
}

export async function siteAccessCookie(request: NextRequest) {
  const passcode = configuredPasscode();
  if (!passcode) throw new Error("SITE_PASSCODE is not configured.");
  return {
    name: SITE_ACCESS_COOKIE,
    value: await tokenFor(passcode),
    httpOnly: true,
    maxAge: COOKIE_LIFETIME_SECONDS,
    path: "/",
    sameSite: "strict" as const,
    secure: new URL(request.url).protocol === "https:",
  };
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || url.pathname === "/login") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
