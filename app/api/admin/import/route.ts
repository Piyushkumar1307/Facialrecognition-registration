import { NextRequest } from "next/server";
import { hasAddUserAccessForRequest } from "@/lib/server/add-user-access";
import { requestUser } from "@/lib/server/auth";
import { ensureDatabaseSchema } from "@/lib/server/database";
import { AppConfigurationError } from "@/lib/server/env";
import { hasSameOrigin, noStoreJson } from "@/lib/server/http";
import {
  importOneUser,
  type ImportRowResult,
  type ImportUserInput,
} from "@/lib/server/import-users";

export const dynamic = "force-dynamic";

const MAX_ROWS_PER_REQUEST = 5;

function isImportInput(value: unknown): value is ImportUserInput {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return noStoreJson({ error: "This request must come from FaceCheck." }, { status: 403 });
  }

  const user = await requestUser();
  if (!user) return noStoreJson({ error: "Sign in before importing users." }, { status: 401 });
  if (!(await hasAddUserAccessForRequest(request))) {
    return noStoreJson({ error: "Enter the add-user passcode before importing users." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Send a valid JSON import payload." }, { status: 400 });
  }
  const rows =
    body && typeof body === "object" && "rows" in body
      ? (body as { rows?: unknown }).rows
      : null;
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS_PER_REQUEST) {
    return noStoreJson(
      { error: `Import between 1 and ${MAX_ROWS_PER_REQUEST} rows at a time.` },
      { status: 400 },
    );
  }
  if (!rows.every(isImportInput)) {
    return noStoreJson({ error: "Each import row must be an object." }, { status: 400 });
  }

  try {
    await ensureDatabaseSchema();
  } catch (error) {
    if (error instanceof AppConfigurationError) {
      return noStoreJson(
        { error: "The Neon database is not configured yet. Ask an administrator to finish setup." },
        { status: 503 },
      );
    }
    console.error("Database initialization failed", error instanceof Error ? error.name : "UnknownError");
    return noStoreJson({ error: "The database is not available right now." }, { status: 502 });
  }

  const results: ImportRowResult[] = [];
  for (const row of rows) {
    const fallbackExternalId =
      typeof row.externalId === "string" && row.externalId.trim()
        ? row.externalId.trim().slice(0, 128)
        : "Unknown row";
    try {
      results.push(await importOneUser(row));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not import this row.";
      results.push({ externalId: fallbackExternalId, status: "failed", message });
    }
  }

  const summary = results.reduce(
    (counts, result) => ({ ...counts, [result.status]: counts[result.status] + 1 }),
    { created: 0, updated: 0, saved_without_face: 0, failed: 0 },
  );
  return noStoreJson({ results, summary });
}

