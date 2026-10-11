"use client";

/* Full document navigation is intentional for compatibility with Render's Worker proxy. */
/* eslint-disable @next/next/no-html-link-for-pages */

import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  IdCard,
  Mail,
  ScanFace,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";

type MatchResult = {
  externalId: string;
  fullName: string;
  age?: string | null;
  profession?: string | null;
  email?: string | null;
  department?: string | null;
  role?: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readResult(): MatchResult | null {
  try {
    const raw = sessionStorage.getItem("facecheck:last-match");
    if (!raw) return null;
    sessionStorage.removeItem("facecheck:last-match");
    const value = JSON.parse(raw) as Record<string, unknown>;
    const externalId = text(value.externalId);
    const fullName = text(value.fullName);
    if (!externalId || !fullName) return null;
    return {
      externalId,
      fullName,
      age: text(value.age),
      profession: text(value.profession),
      email: text(value.email),
      department: text(value.department),
      role: text(value.role),
    };
  } catch {
    return null;
  }
}

export function MatchResultCard() {
  const [result, setResult] = useState<MatchResult | null | undefined>(undefined);
  useEffect(() => {
    const timer = window.setTimeout(() => setResult(readResult()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (result === undefined) {
    return (
      <div className="grid min-h-72 place-items-center rounded-3xl border border-slate-200 bg-white">
        <ScanFace className="size-9 animate-pulse text-emerald-700" aria-label="Loading result" />
      </div>
    );
  }

  if (!result) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
          <ScanFace className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">No recent result</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
          Results are kept only for the current browser session and opened immediately after a confirmed match.
        </p>
        <a href="/" className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800">
          <ScanFace className="size-4" /> Start a face scan
        </a>
      </section>
    );
  }

  const initials = result.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const details = [
    { label: "External ID", value: result.externalId, icon: IdCard },
    { label: "Age", value: result.age, icon: CalendarDays },
    { label: "Profession", value: result.profession, icon: BriefcaseBusiness },
    { label: "Department", value: result.department, icon: Building2 },
    { label: "Role", value: result.role, icon: UserRound },
    { label: "Email", value: result.email, icon: Mail },
  ].filter((item) => item.value);

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.1)]">
      <div className="bg-gradient-to-br from-[#075c52] to-[#0d8174] px-6 py-8 text-white sm:px-9">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
          <BadgeCheck className="size-5" /> Identity confirmed
        </div>
        <div className="mt-6 flex items-center gap-5">
          <span className="grid size-20 shrink-0 place-items-center rounded-3xl border border-white/25 bg-white/15 text-2xl font-bold backdrop-blur">
            {initials}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-bold tracking-tight">{result.fullName}</h1>
            <p className="mt-1 text-emerald-100">{result.profession ?? result.role ?? "Enrolled member"}</p>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-9">
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <ShieldCheck className="size-5 shrink-0 text-emerald-700" />
          This face matched an active profile in the private directory.
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {details.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                <Icon className="size-4" /> {label}
              </dt>
              <dd className="mt-2 break-words font-semibold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        <a href="/" className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowLeft className="size-4" /> Scan another person
        </a>
      </div>
    </section>
  );
}
