import { FileSpreadsheet, ShieldAlert } from "lucide-react";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AddUserImporter } from "@/components/add-user-importer";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";

export default async function AddUserPage() {
  await requireChatGPTUser("/adduser");
  return (
    <main className="min-h-screen bg-[#f7f8f6] text-[#12211d]">
      <SiteHeader current="import" />
      <div className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-9 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#c9dfd7] bg-[#ecf8f4] px-3 py-1 text-xs font-semibold text-[#075c52]">
              <FileSpreadsheet className="size-3.5" aria-hidden="true" />
              Administrator enrollment
            </div>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Add people from a CSV</h1>
            <p className="mt-3 max-w-xl text-pretty leading-7 text-[#5d6f67]">
              Review rows before importing. A reference image URL enrolls that person for face matching; rows without one are saved as profiles only.
            </p>
          </div>
          <div className="flex max-w-sm gap-2 rounded-xl border border-[#f0d8aa] bg-[#fff9eb] px-3 py-2.5 text-xs leading-5 text-[#765a22]">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Only addresses listed in <code className="font-semibold">ADMIN_EMAILS</code> can complete an import.
          </div>
        </div>
        <AddUserImporter />
      </div>
    </main>
  );
}
