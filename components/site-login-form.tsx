"use client";

import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

export function SiteLoginForm() {
  const searchParams = useSearchParams();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passcode || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passcode,
          returnTo: searchParams.get("return_to") ?? "/",
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { authorized?: boolean; returnTo?: string; error?: string }
        | null;
      if (!response.ok || payload?.authorized !== true) {
        throw new Error(payload?.error ?? "Login failed. Please try again.");
      }
      window.location.assign(payload.returnTo ?? "/");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,0.1)] sm:p-9">
      <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
        <ShieldCheck className="size-6" />
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-950">Open FaceCheck</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Enter the private site passcode to continue. Access remains active in this browser for 12 hours.
      </p>
      <form className="mt-7 space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Site passcode</span>
          <div className="relative mt-1.5">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              disabled={loading}
              onChange={(event) => setPasscode(event.target.value)}
              required
              type="password"
              value={passcode}
            />
          </div>
        </label>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        <button disabled={loading || !passcode} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {loading ? "Checking…" : "Continue"}
        </button>
      </form>
    </section>
  );
}
