"use client";

import { useState } from "react";
import { errorTextClass } from "@/app/ui/styles";
import { authClient } from "@/lib/auth-client";

const buttonClass =
  "flex h-12 items-center justify-center rounded-full border border-solid border-rule px-5 font-medium transition-colors hover:bg-surface disabled:opacity-50";

// callbackURL 은 이 앱 안 상대 경로만 넘긴다(초대 화면이 서버에서 만든 `/invite/<비밀값>`, #15).
export function GoogleSignInButton({
  callbackURL = "/",
}: {
  callbackURL?: string;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL,
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
        <p role="alert" className={errorTextClass}>
          로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    const { error } = await authClient.signOut();
    if (error) {
      setFailed(true);
      setPending(false);
      return;
    }
    // 전체 페이지를 새로 불러온다. 클라이언트 이동은 숨겨 보관된 화면(내 여행 목록 등)을 페이지에 남긴다.
    window.location.assign("/");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className={buttonClass}
        onClick={signOut}
        disabled={pending}
      >
        로그아웃
      </button>
      {failed && (
        <p role="alert" className={errorTextClass}>
          로그아웃하지 못했어요. 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}
