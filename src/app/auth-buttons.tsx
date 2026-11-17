"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const buttonClass =
  "flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 font-medium transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]";

export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
    });
    // 성공하면 Google 로 이동하므로 여기까지 오는 것은 실패한 경우뿐입니다.
    if (error) {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        className={buttonClass}
        onClick={signIn}
        disabled={pending}
      >
        Google 계정으로 로그인
      </button>
      {failed && (
        <p role="alert" className="text-sm text-red-600">
          로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.refresh();
    setPending(false);
  }

  return (
    <button
      type="button"
      className={buttonClass}
      onClick={signOut}
      disabled={pending}
    >
      로그아웃
    </button>
  );
}
