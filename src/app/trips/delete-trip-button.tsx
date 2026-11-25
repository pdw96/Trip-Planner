"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/app/ui/styles";
import { deleteTripAction } from "./actions";

// record: 떼어 낸 기록(#103)이면 "기록 지우기"로 부른다.
export function DeleteTripButton({
  tripId,
  record = false,
}: {
  tripId: string;
  record?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    const question = record
      ? "이 기록을 지울까요? 지우면 되돌릴 수 없어요."
      : "정말 삭제할까요? 함께하는 사람들에게는 각자 기록이 남아요.";
    if (!window.confirm(question)) return;
    startTransition(async () => {
      const result = await deleteTripAction(tripId);
      setError(result.error);
    });
  }

  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={buttonClass("danger", "small")}
      >
        {record
          ? pending
            ? "지우는 중…"
            : "기록 지우기"
          : pending
            ? "삭제하는 중…"
            : "삭제"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
