import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MiniLine } from "@/app/ui/mini-line";
import { getCurrentUser } from "@/lib/session";
import { GoogleSignInButton } from "./auth-buttons";
import { InAppBrowserNotice } from "./in-app-browser-notice";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="flex flex-col items-center gap-5">
        <MiniLine dayCount={3} size="lg" />
        <h1 className="text-3xl font-bold">Trip Planner</h1>
      </div>
      <Suspense fallback={<p className="text-sub">불러오는 중…</p>}>
        <AuthStatus />
      </Suspense>
    </main>
  );
}

async function AuthStatus() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <p className="text-sub">여행 계획을 만들려면 로그인하세요.</p>
        <InAppBrowserNotice />
        <GoogleSignInButton />
      </>
    );
  }

  // 로그인 버튼의 callbackURL 이 "/" 이므로, 로그인 뒤에는 여기서 목록으로 보낸다.
  redirect("/trips");
}
