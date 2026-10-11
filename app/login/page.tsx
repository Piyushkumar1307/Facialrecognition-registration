import { Suspense } from "react";

import { SiteLoginForm } from "@/components/site-login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8f6] px-5 py-12">
      <Suspense>
        <SiteLoginForm />
      </Suspense>
    </main>
  );
}
