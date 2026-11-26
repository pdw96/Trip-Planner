import Link from "next/link";
import { Suspense } from "react";
import { AppName } from "@/app/ui/app-name";
import { MiniLine } from "@/app/ui/mini-line";
import { primaryButtonClass } from "@/app/ui/styles";
import { getCurrentUser } from "@/lib/session";
import { GoogleSignInButton, SignOutButton } from "../auth-buttons";
import { InAppBrowserNotice } from "../in-app-browser-notice";
import { NextTripSection } from "./next-trip-section";

// `/`: 로그인하지 않았으면 로그인 화면, 로그인했으면 홈(#122). 어느 쪽인지 요청마다 달라 화면 전체를 Suspense 안에서 고른다.
export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center px-6 py-24">
          <p className="text-sub">불러오는 중…</p>
        </main>
      }
    >
      <HomeOrSignIn />
    </Suspense>
  );
}

async function HomeOrSignIn() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  return <HomeScreen userId={user.id} />;
}

function SignIn() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="flex flex-col items-center gap-5">
        <MiniLine dayCount={3} size="lg" />
        <h1 className="text-3xl font-bold">Trip Planner</h1>
      </div>
      <p className="text-sub">여행 계획을 만들려면 로그인하세요.</p>
      <InAppBrowserNotice />
      <GoogleSignInButton />
    </main>
  );
}

// 홈은 칸을 쌓는다. 지금은 "다음 여행" 하나이고, 홈만의 기능(피드 등)은 칸 하나로 더한다(#122).
function HomeScreen({ userId }: { userId: string }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="sr-only">홈</h1>
      <header className="flex items-center justify-between gap-3 sm:hidden">
        <AppName />
        <div className="flex items-center gap-1">
          <Link href="/trips/new" className={primaryButtonClass}>
            + 새 여행
          </Link>
          <SignOutButton />
        </div>
      </header>
      <Suspense fallback={<p className="text-sub">불러오는 중…</p>}>
        <NextTripSection userId={userId} />
      </Suspense>
    </main>
  );
}
