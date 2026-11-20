"use client";

import { useState, useTransition } from "react";
import { errorTextClass, primaryButtonClass } from "@/app/ui/styles";
import { joinTripAction } from "../actions";

export function JoinButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    startTransition(async () => {
      // 성공하면 서버가 여행 화면으로 보낸다. 돌아오는 것은 실패뿐이다.
      const result = await joinTripAction(token);
      setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={primaryButtonClass}
      >
        {pending ? "참여하는 중…" : "참여"}
      </button>
      {error && (
        <p role="alert" className={errorTextClass}>
          {error}
        </p>
      )}
    </div>
  );
}
