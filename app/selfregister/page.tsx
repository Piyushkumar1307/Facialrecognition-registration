import { ShieldCheck, UserRoundPlus } from "lucide-react";

import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AddUserPasscodeGate } from "@/components/add-user-passcode-gate";
import { SelfRegistrationForm } from "@/components/self-registration-form";
import { SiteHeader } from "@/components/site-header";
import { hasAddUserAccess } from "@/lib/server/add-user-access";

export const dynamic = "force-dynamic";

export default async function SelfRegisterPage() {
  await requireChatGPTUser("/selfregister");
  const hasAccess = await hasAddUserAccess();

  return (
    <main className="min-h-screen bg-[#f7f8f6] text-[#12211d]">
      <SiteHeader current="register" />
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-9 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#c9dfd7] bg-[#ecf8f4] px-3 py-1 text-xs font-semibold text-[#075c52]">
              <UserRoundPlus className="size-3.5" aria-hidden="true" />
              Secure self-enrollment
            </div>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Register yourself</h1>
            <p className="mt-3 max-w-xl text-pretty leading-7 text-[#5d6f67]">
              Capture a clear photo and enter your details. Your profile will be available after face enrollment succeeds.
            </p>
          </div>
          <div className="flex max-w-sm gap-2 rounded-xl border border-[#c9dfd7] bg-[#ecf8f4] px-3 py-2.5 text-xs leading-5 text-[#075c52]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {hasAccess ? "Self-registration unlocked for this browser." : "Enter the enrollment passcode to continue."}
          </div>
        </div>
        {hasAccess ? (
          <SelfRegistrationForm />
        ) : (
          <AddUserPasscodeGate
            description="This check unlocks self-registration for this browser for eight hours."
            buttonLabel="Unlock registration"
          />
        )}
      </div>
    </main>
  );
}
