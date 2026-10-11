/* Full document navigation is intentional for compatibility with Render's Worker proxy. */
/* eslint-disable @next/next/no-html-link-for-pages */

import { Camera, ShieldCheck, Upload, UserRoundPlus } from "lucide-react";

type SiteHeaderProps = {
  current: "scan" | "import" | "register";
};

export function SiteHeader({ current }: SiteHeaderProps) {
  return (
    <header className="border-b border-[#dce6e1] bg-[#fbfdfb]/95 backdrop-blur">
      <div className="mx-auto flex min-h-18 max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <a href="/" className="flex items-center gap-3 text-[#12211d]" aria-label="FaceCheck scan home">
          <span className="grid size-10 place-items-center rounded-xl bg-[#0c6b62] text-white shadow-sm">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-base font-bold tracking-tight">FaceCheck</span>
            <span className="block text-[11px] font-medium uppercase tracking-[0.13em] text-[#64756e]">
              Private lookup
            </span>
          </span>
        </a>

        <nav aria-label="Primary navigation" className="flex items-center gap-1 rounded-xl border border-[#dce6e1] bg-white p-1 text-sm font-medium">
          <a
            href="/"
            aria-current={current === "scan" ? "page" : undefined}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 transition-colors ${
              current === "scan"
                ? "bg-[#ddf4ee] text-[#075c52]"
                : "text-[#5d6f67] hover:bg-[#f1f5f2] hover:text-[#12211d]"
            }`}
          >
            <Camera className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Scan</span>
          </a>
          <a
            href="/selfregister"
            aria-current={current === "register" ? "page" : undefined}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 transition-colors ${
              current === "register"
                ? "bg-[#ddf4ee] text-[#075c52]"
                : "text-[#5d6f67] hover:bg-[#f1f5f2] hover:text-[#12211d]"
            }`}
          >
            <UserRoundPlus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Self-register</span>
          </a>
          <a
            href="/adduser"
            aria-current={current === "import" ? "page" : undefined}
            className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 transition-colors ${
              current === "import"
                ? "bg-[#ddf4ee] text-[#075c52]"
                : "text-[#5d6f67] hover:bg-[#f1f5f2] hover:text-[#12211d]"
            }`}
          >
            <Upload className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add users</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

