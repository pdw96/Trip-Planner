import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";
import { GoogleSignInButton } from "./auth-buttons";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Trip Planner</h1>
      <Suspense fallback={<p className="text-zinc-500">불러오는 중…</p>}>
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
        <p className="text-zinc-600 dark:text-zinc-400">
          여행 계획을 만들려면 로그인하세요.
        </p>
        <GoogleSignInButton />
      </>
    );
  }

  // 로그인 버튼의 callbackURL 이 "/" 이므로, 로그인 뒤에는 여기서 목록으로 보낸다.
  redirect("/trips");
}
