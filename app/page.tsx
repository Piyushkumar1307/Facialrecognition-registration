import { ArrowRight, LockKeyhole, ScanFace } from "lucide-react";
import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ScanPanel } from "@/components/scan-panel";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireChatGPTUser("/");
  return (
    <main className="min-h-screen bg-[#f7f8f6] text-[#12211d]">
      <SiteHeader current="scan" />
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-9 max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#c9dfd7] bg-[#ecf8f4] px-3 py-1 text-xs font-semibold text-[#075c52]">
            <ScanFace className="size-3.5" aria-hidden="true" />
            Consent-based face lookup
          </div>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Verify an enrolled face</h1>
          <p className="mt-3 max-w-xl text-pretty leading-7 text-[#5d6f67]">
            Start your camera, center one face in frame, then run a secure similarity check against enrolled records.
          </p>
        </div>

        <ScanPanel />

        <aside className="mt-8 flex flex-col gap-4 rounded-2xl border border-[#dce6e1] bg-white p-5 text-sm text-[#5d6f67] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#0c6b62]" aria-hidden="true" />
            <p>
              Live scan photos are processed for this check and are not saved by FaceCheck. Use only with consent.
            </p>
          </div>
          <Link href="/adduser" className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-[#075c52] hover:text-[#063f39]">
            Enroll users <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </main>
  );
}
