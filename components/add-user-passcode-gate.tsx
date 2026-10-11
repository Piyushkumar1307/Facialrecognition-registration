"use client";

import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { cn } from "@/lib/utils";

type PasscodeResponse = {
  authorized?: unknown;
  error?: unknown;
};

function responseError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as PasscodeResponse).error;
  return typeof error === "string" && error.trim() ? error : null;
}

export function AddUserPasscodeGate() {
  const [passcode, setPasscode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passcode || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object" || (payload as PasscodeResponse).authorized !== true) {
        throw new Error(responseError(payload) ?? "We could not verify that passcode. Please try again.");
      }
      setPasscode("");
      window.location.reload();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We could not verify that passcode.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
      <span className="grid size-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
        <ShieldCheck className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-slate-950">Enter admin passcode</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        This additional check unlocks the CSV importer for this browser for eight hours.
      </p>

      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Passcode</span>
          <div className="relative mt-1.5">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              autoComplete="current-password"
              className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              disabled={isSubmitting}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="Enter passcode"
              required
              type="password"
              value={passcode}
            />
          </div>
        </label>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        <button
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60",
          )}
          disabled={isSubmitting || !passcode}
          type="submit"
        >
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <KeyRound className="size-4" aria-hidden="true" />}
          {isSubmitting ? "Checking…" : "Unlock importer"}
        </button>
      </form>
    </section>
  );
}
