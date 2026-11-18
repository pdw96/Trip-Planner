"use client";

import { secondaryButtonClass } from "./trips/styles";

// 예상하지 못한 오류(DB 연결 실패 등)에서 영어 기본 화면 대신 보이는 한국어 화면.

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        문제가 생겼어요.
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        잠시 후 다시 시도해 주세요.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className={secondaryButtonClass}
      >
        다시 시도
      </button>
    </main>
  );
}
