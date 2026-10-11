import { env as workerEnv } from "cloudflare:workers";

type RuntimeEnvironment = Record<string, unknown>;

export class AppConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppConfigurationError";
  }
}

/**
 * Reads a value from the Worker binding in production and from process.env in
 * local development. Never import this module into a client component.
 */
export function readEnvironment(name: string): string | undefined {
  const workerValue = (workerEnv as unknown as RuntimeEnvironment)[name];
  const value =
    typeof workerValue === "string" ? workerValue : process.env[name];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function requireEnvironment(name: string): string {
  const value = readEnvironment(name);
  if (!value) {
    throw new AppConfigurationError(
      `${name} is not configured. Add it as a server-side runtime secret.`,
    );
  }
  return value;
}

export function readIntegerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = readEnvironment(name);
  if (!rawValue) return fallback;

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

export function getMaxImageBytes(): number {
  // Rekognition's Bytes payload limit is 5 MB. Keep this bounded even if an
  // accidental environment value is much larger.
  return readIntegerEnvironment("MAX_IMAGE_BYTES", 5_000_000, 100_000, 5_000_000);
}

export function getMatchThreshold(): number {
  return readIntegerEnvironment("FACE_MATCH_THRESHOLD", 95, 80, 100);
}

export function getMatchMargin(): number {
  return readIntegerEnvironment("FACE_MATCH_MARGIN", 3, 0, 25);
}

export function getAdminEmails(): Set<string> {
  const raw = readEnvironment("ADMIN_EMAILS");
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

