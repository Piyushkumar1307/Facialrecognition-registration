import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { MatchResultCard } from "@/components/match-result-card";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";

export default async function ResultPage() {
  await requireChatGPTUser("/result");
  return (
    <main className="min-h-screen bg-[#f7f8f6] text-[#12211d]">
      <SiteHeader current="scan" />
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <MatchResultCard />
      </div>
    </main>
  );
}
