"use client";

import {
  CheckCircle2,
  CircleAlert,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import Papa from "papaparse";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

export type ImportUserRow = {
  externalId: string;
  fullName: string;
  email: string | null;
  department: string | null;
  role: string | null;
  faceImageUrl: string | null;
  metadata: Record<string, unknown> | null;
};

type ImportStatus = "created" | "updated" | "saved_without_face" | "failed" | "processed";

type ImportResult = {
  externalId: string;
  status: ImportStatus;
  message?: string;
};

type HeaderField = keyof ImportUserRow;

type ParsedRow = {
  rowNumber: number;
  row: ImportUserRow;
  errors: string[];
  warnings: string[];
};

type AddUserImporterProps = {
  className?: string;
  /** Called when every valid row in a selected file has been submitted. */
  onImportComplete?: (results: ImportResult[]) => void;
};

const BATCH_SIZE = 5;
const PREVIEW_ROWS = 8;
const requiredFields: HeaderField[] = ["externalId", "fullName"];

const fieldLabels: Record<HeaderField, string> = {
  externalId: "External ID",
  fullName: "Full name",
  email: "Email",
  department: "Department",
  role: "Role",
  faceImageUrl: "Face image URL",
  metadata: "Metadata",
};

// Header names are normalized before matching, so spaces, dashes, underscores,
// and casing do not matter. The first matching CSV column is used.
const headerAliases: Record<HeaderField, string[]> = {
  externalId: [
    "externalId",
    "external id",
    "employeeId",
    "employee id",
    "employee number",
    "staffId",
    "staff id",
    "userId",
    "user id",
    "identifier",
    "id",
  ],
  fullName: ["fullName", "full name", "name", "employee name", "user name", "display name"],
  email: ["email", "email address", "e-mail", "mail"],
  department: ["department", "dept", "team", "division", "organization", "organisation"],
  role: ["role", "job title", "title", "position", "designation"],
  faceImageUrl: [
    "faceImageUrl",
    "face image url",
    "face url",
    "image url",
    "photo url",
    "avatar url",
    "profile image url",
    "image",
    "photo",
  ],
  metadata: ["metadata", "meta", "custom data", "additional data", "notes"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getHeaderMap(headers: string[]): Partial<Record<HeaderField, string>> {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  return (Object.keys(headerAliases) as HeaderField[]).reduce<Partial<Record<HeaderField, string>>>(
    (mapping, field) => {
      const aliases = new Set(headerAliases[field].map(normalizeHeader));
      const match = normalizedHeaders.find((header) => aliases.has(header.normalized));

      if (match) mapping[field] = match.original;
      return mapping;
    },
    {},
  );
}

function parseMetadata(value: string): { metadata: Record<string, unknown> | null; error?: string } {
  if (!value) return { metadata: null };

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) {
      return { metadata: null, error: "Metadata must be a JSON object" };
    }
    return { metadata: parsed };
  } catch {
    return { metadata: null, error: "Metadata must be valid JSON" };
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isCsvFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
}

function metadataPreview(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "—";
  const content = JSON.stringify(metadata);
  return content.length > 42 ? `${content.slice(0, 39)}…` : content;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseMessage(payload: unknown, fallback: string): string {
  return isRecord(payload) && typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : fallback;
}

function asImportResults(payload: unknown, fallbackRows: ImportUserRow[]): ImportResult[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return fallbackRows.map((row) => ({ externalId: row.externalId, status: "processed" }));
  }

  return payload.results.map((value, index) => {
    const fallback = fallbackRows[index];
    if (!isRecord(value)) {
      return { externalId: fallback?.externalId ?? "Unknown", status: "processed" };
    }

    const rawStatus = cleanString(value.status);
    const status: ImportStatus =
      rawStatus === "created" ||
      rawStatus === "updated" ||
      rawStatus === "saved_without_face" ||
      rawStatus === "failed"
        ? rawStatus
        : "processed";

    return {
      externalId: cleanString(value.externalId) || fallback?.externalId || "Unknown",
      status,
      message: cleanString(value.message) || undefined,
    };
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Client-side CSV intake for the /adduser page. The selected file is parsed
 * locally, validated before it is sent, and posted in batches of five rows.
 */
export function AddUserImporter({ className, onImportComplete }: AddUserImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const parseRequestRef = useRef(0);
  const importAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const inputId = useId();

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headerMap, setHeaderMap] = useState<Partial<Record<HeaderField, string>>>({});
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  const validRows = useMemo(() => rows.filter((entry) => entry.errors.length === 0), [rows]);
  const invalidCount = rows.length - validRows.length;
  const progressPercent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;

  const resultCounts = useMemo(() => {
    return importResults.reduce<Record<ImportStatus, number>>(
      (counts, result) => {
        counts[result.status] += 1;
        return counts;
      },
      { created: 0, updated: 0, saved_without_face: 0, failed: 0, processed: 0 },
    );
  }, [importResults]);

  const resetImport = useCallback(() => {
    parseRequestRef.current += 1;
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    setFileName(null);
    setRows([]);
    setHeaderMap({});
    setFileErrors([]);
    setIsDragging(false);
    setIsParsing(false);
    setIsImporting(false);
    setProgress({ completed: 0, total: 0 });
    setImportResults([]);
    setImportError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      parseRequestRef.current += 1;
      importAbortRef.current?.abort();
    };
  }, []);

  const loadFile = useCallback((file: File) => {
    if (!isCsvFile(file)) {
      resetImport();
      setFileErrors(["Choose a .csv file to continue."]);
      return;
    }

    const requestId = parseRequestRef.current + 1;
    parseRequestRef.current = requestId;
    importAbortRef.current?.abort();
    importAbortRef.current = null;

    setFileName(file.name);
    setRows([]);
    setHeaderMap({});
    setFileErrors([]);
    setImportResults([]);
    setImportError(null);
    setProgress({ completed: 0, total: 0 });
    setIsParsing(true);

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (result) => {
        if (!mountedRef.current || requestId !== parseRequestRef.current) return;

        const headers = (result.meta.fields ?? []).filter((header): header is string => Boolean(header));
        const mapping = getHeaderMap(headers);
        const errors: string[] = [];
        const missingHeaders = requiredFields.filter((field) => !mapping[field]);

        if (missingHeaders.length) {
          errors.push(`Missing required column${missingHeaders.length === 1 ? "" : "s"}: ${missingHeaders.map((field) => fieldLabels[field]).join(", ")}.`);
        }

        if (result.errors.length) {
          const parseMessages = Array.from(
            new Set(
              result.errors.slice(0, 3).map((error) => {
                const row = typeof error.row === "number" ? ` on row ${error.row + 2}` : "";
                return `${error.message}${row}`;
              }),
            ),
          );
          errors.push(...parseMessages);
        }

        const parsedRows = result.data.map((rawRow, index): ParsedRow => {
          const externalId = cleanString(mapping.externalId ? rawRow[mapping.externalId] : "");
          const fullName = cleanString(mapping.fullName ? rawRow[mapping.fullName] : "");
          const email = cleanString(mapping.email ? rawRow[mapping.email] : "");
          const department = cleanString(mapping.department ? rawRow[mapping.department] : "");
          const role = cleanString(mapping.role ? rawRow[mapping.role] : "");
          const faceImageUrl = cleanString(mapping.faceImageUrl ? rawRow[mapping.faceImageUrl] : "");
          const metadataValue = cleanString(mapping.metadata ? rawRow[mapping.metadata] : "");
          const parsedMetadata = parseMetadata(metadataValue);
          const rowErrors: string[] = [];
          const warnings: string[] = [];

          if (!externalId) rowErrors.push("External ID is required");
          if (!fullName) rowErrors.push("Full name is required");
          if (email && !isValidEmail(email)) rowErrors.push("Email is not valid");
          if (faceImageUrl && !isHttpUrl(faceImageUrl)) rowErrors.push("Face image URL must begin with http:// or https://");
          if (parsedMetadata.error) rowErrors.push(parsedMetadata.error);
          if (!faceImageUrl) warnings.push("No face image URL — this user will be saved without a face match");

          return {
            rowNumber: index + 2,
            row: {
              externalId,
              fullName,
              email: email || null,
              department: department || null,
              role: role || null,
              faceImageUrl: faceImageUrl || null,
              metadata: parsedMetadata.metadata,
            },
            errors: rowErrors,
            warnings,
          };
        });

        const duplicateRows = new Map<string, ParsedRow[]>();
        parsedRows.forEach((entry) => {
          if (!entry.row.externalId) return;
          const key = entry.row.externalId.toLocaleLowerCase();
          duplicateRows.set(key, [...(duplicateRows.get(key) ?? []), entry]);
        });
        duplicateRows.forEach((entries) => {
          if (entries.length > 1) {
            entries.forEach((entry) => entry.errors.push("External ID is duplicated in this file"));
          }
        });

        if (!parsedRows.length) errors.push("This CSV does not contain any data rows.");

        setHeaderMap(mapping);
        setRows(parsedRows);
        setFileErrors(errors);
        setIsParsing(false);
      },
      error: (error) => {
        if (!mountedRef.current || requestId !== parseRequestRef.current) return;
        setRows([]);
        setFileErrors([error.message || "We could not read that CSV file."]);
        setIsParsing(false);
      },
    });
  }, [resetImport]);

  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) loadFile(file);
    },
    [loadFile],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (isImporting) return;

      const file = event.dataTransfer.files?.[0];
      if (file) loadFile(file);
    },
    [isImporting, loadFile],
  );

  const handleDropKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }, []);

  const downloadTemplate = useCallback(() => {
    const csv = [
      "externalId,fullName,email,department,role,faceImageUrl,metadata",
      'EMP-001,Jane Doe,jane.doe@example.com,Operations,Manager,https://res.cloudinary.com/example/image/upload/jane-doe.jpg,"{""location"":""HQ""}"',
    ].join("\n");
    const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = "facecheck-user-import-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
  }, []);

  const importRows = useCallback(async () => {
    if (!validRows.length || fileErrors.length || isImporting) return;

    const rowsToImport = validRows.map((entry) => entry.row);
    const batches = chunk(rowsToImport, BATCH_SIZE);
    const controller = new AbortController();
    importAbortRef.current?.abort();
    importAbortRef.current = controller;

    setIsImporting(true);
    setImportError(null);
    setImportResults([]);
    setProgress({ completed: 0, total: rowsToImport.length });

    const allResults: ImportResult[] = [];

    try {
      for (const batch of batches) {
        const response = await fetch("/api/admin/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch }),
          signal: controller.signal,
        });
        const payload = await readJson(response);

        if (controller.signal.aborted || !mountedRef.current) return;
        if (!response.ok) {
          throw new Error(responseMessage(payload, "The import could not be completed. Please try again."));
        }

        const batchResults = asImportResults(payload, batch);
        allResults.push(...batchResults);
        setImportResults([...allResults]);
        setProgress((current) => ({
          ...current,
          completed: Math.min(current.total, current.completed + batch.length),
        }));
      }

      onImportComplete?.(allResults);
    } catch (error) {
      if (!controller.signal.aborted && mountedRef.current) {
        setImportError(
          error instanceof Error ? error.message : "The import could not be completed. Please try again.",
        );
      }
    } finally {
      if (importAbortRef.current === controller) {
        importAbortRef.current = null;
      }
      if (mountedRef.current && !controller.signal.aborted) {
        setIsImporting(false);
      }
    }
  }, [fileErrors.length, isImporting, onImportComplete, validRows]);

  const headerMappings = (Object.keys(fieldLabels) as HeaderField[]).filter((field) => headerMap[field]);

  return (
    <section
      aria-labelledby="csv-import-heading"
      className={cn(
        "w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]",
        className,
      )}
    >
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
            <FileSpreadsheet className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="csv-import-heading" className="text-lg font-semibold tracking-tight text-slate-950">
              Import directory users
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              Upload a CSV to create or update people and their face image links.
            </p>
          </div>
        </div>
        <button
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          onClick={downloadTemplate}
          type="button"
        >
          <Download className="size-4" aria-hidden="true" />
          Download template
        </button>
      </div>

      <div className="space-y-6 p-5 sm:p-7">
        <div
          aria-describedby={`${inputId}-help`}
          aria-label="CSV file drop area"
          className={cn(
            "relative flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-8 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
            isDragging ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/50",
            isImporting && "cursor-not-allowed opacity-60",
          )}
          onClick={() => !isImporting && inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!isImporting) setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          onKeyDown={handleDropKeyDown}
          role="button"
          tabIndex={isImporting ? -1 : 0}
        >
          <input
            ref={inputRef}
            accept=".csv,text/csv"
            className="sr-only"
            disabled={isImporting}
            id={inputId}
            onChange={handleFileInput}
            type="file"
          />
          <span className="grid size-12 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
            {isParsing ? <LoaderCircle className="size-6 animate-spin" aria-hidden="true" /> : <Upload className="size-6" aria-hidden="true" />}
          </span>
          <p className="mt-4 text-sm font-semibold text-slate-900">
            {isParsing ? "Reading your CSV…" : isDragging ? "Drop the CSV here" : "Drag and drop a CSV here"}
          </p>
          <p id={`${inputId}-help`} className="mt-1 text-sm text-slate-500">
            or <span className="font-medium text-indigo-700">choose a file</span> from your computer
          </p>
          <p className="mt-3 text-xs text-slate-500">Required: External ID and full name. Face image URL is optional.</p>
        </div>

        {fileName && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <FileSpreadsheet className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
              <p className="truncate text-sm font-medium text-slate-800" title={fileName}>
                {fileName}
              </p>
              {isParsing && <LoaderCircle className="size-4 shrink-0 animate-spin text-indigo-600" aria-label="Parsing CSV" />}
            </div>
            <button
              aria-label="Remove selected CSV"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed"
              disabled={isImporting}
              onClick={resetImport}
              type="button"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {fileErrors.length > 0 && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-950">
            <div className="flex gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden="true" />
              <div>
                <p className="font-semibold">Check this file</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-5 text-rose-900">
                  {fileErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {headerMappings.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Recognized columns</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {headerMappings.map((field) => (
                <div key={field} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
                  <dt className="font-medium text-slate-700">{fieldLabels[field]}</dt>
                  <dd className="truncate text-slate-500" title={headerMap[field]}>
                    {headerMap[field]}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">Preview and validation</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {validRows.length} ready to import{invalidCount ? ` · ${invalidCount} need attention` : ""}
                </p>
              </div>
              {invalidCount === 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  All rows valid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  <CircleAlert className="size-3.5" aria-hidden="true" />
                  Invalid rows are skipped
                </span>
              )}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[820px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Row</th>
                    <th className="px-4 py-3 font-semibold">Person</th>
                    <th className="px-4 py-3 font-semibold">External ID</th>
                    <th className="px-4 py-3 font-semibold">Face image</th>
                    <th className="px-4 py-3 font-semibold">Metadata</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rows.slice(0, PREVIEW_ROWS).map((entry) => {
                    const issueText = entry.errors[0] ?? entry.warnings[0];
                    return (
                      <tr key={entry.rowNumber} className={entry.errors.length ? "bg-rose-50/40" : ""}>
                        <td className="px-4 py-3 text-slate-500">{entry.rowNumber}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{entry.row.fullName || "—"}</td>
                        <td className="px-4 py-3 text-slate-700">{entry.row.externalId || "—"}</td>
                        <td className="max-w-52 truncate px-4 py-3 text-slate-600" title={entry.row.faceImageUrl ?? undefined}>
                          {entry.row.faceImageUrl ? "Provided" : "Not provided"}
                        </td>
                        <td className="max-w-52 truncate px-4 py-3 font-mono text-xs text-slate-600" title={metadataPreview(entry.row.metadata)}>
                          {metadataPreview(entry.row.metadata)}
                        </td>
                        <td className="max-w-72 px-4 py-3">
                          {issueText ? (
                            <span className={cn("text-xs", entry.errors.length ? "text-rose-700" : "text-amber-700")}>
                              {issueText}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-emerald-700">Ready</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > PREVIEW_ROWS && (
              <p className="text-sm text-slate-500">Showing the first {PREVIEW_ROWS} of {rows.length} rows.</p>
            )}
          </div>
        )}

        {isImporting && (
          <div aria-live="polite" className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
            <div className="flex items-center justify-between gap-4 text-sm font-medium text-indigo-950">
              <span>Importing {progress.completed} of {progress.total} users</span>
              <span>{progressPercent}%</span>
            </div>
            <div
              aria-label="Import progress"
              aria-valuemax={progress.total}
              aria-valuemin={0}
              aria-valuenow={progress.completed}
              className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100"
              role="progressbar"
            >
              <div className="h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="mt-2 text-xs text-indigo-800">Users are sent in secure batches of up to {BATCH_SIZE}.</p>
          </div>
        )}

        {importError && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="flex gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden="true" />
              <div>
                <p className="font-semibold text-rose-950">Import paused</p>
                <p className="mt-1 leading-5">{importError}</p>
              </div>
            </div>
          </div>
        )}

        {importResults.length > 0 && !isImporting && (
          <div aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-emerald-950">Import results</p>
                <p className="mt-1 text-sm text-emerald-900">
                  {resultCounts.created} created · {resultCounts.updated} updated · {resultCounts.saved_without_face} saved without face · {resultCounts.failed} failed
                </p>
                <ul className="mt-3 max-h-40 divide-y divide-emerald-200/70 overflow-y-auto rounded-xl bg-white/60 px-3">
                  {importResults.map((result, index) => (
                    <li key={`${result.externalId}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-emerald-950">{result.externalId}</span>
                      <span className={cn("shrink-0 text-xs", result.status === "failed" ? "text-rose-700" : "text-emerald-800")} title={result.message}>
                        {result.message || result.status.replaceAll("_", " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500">Only valid rows are sent. Existing external IDs are updated.</p>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!validRows.length || fileErrors.length > 0 || isParsing || isImporting}
            onClick={() => void importRows()}
            type="button"
          >
            {isImporting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {isImporting ? "Importing…" : `Import ${validRows.length || ""} user${validRows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </section>
  );
}

export default AddUserImporter;
