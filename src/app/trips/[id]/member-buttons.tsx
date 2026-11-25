"use client";

import { useState, useTransition } from "react";
import { leaveTripAction, removeMemberAction } from "../member-actions";

const linkButtonClass =
  "shrink-0 text-sm text-danger hover:underline disabled:opacity-50";

export function RemoveMemberButton({
  tripId,
  memberUserId,
  name,
}: {
  tripId: string;
  memberUserId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      !window.confirm(
        `${name}님을 내보낼까요? 링크가 켜져 있으면 다시 들어올 수 있어요. 막으려면 새 링크를 만드세요. ${name}님의 일정과 지출은 ${name}님 계정에 떼어 낸 기록으로 남아요.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await removeMemberAction(tripId, memberUserId);
      setError(result.error);
    });
  }

  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={linkButtonClass}
      >
        {pending ? "내보내는 중…" : "내보내기"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

export function LeaveTripButton({ tripId }: { tripId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      !window.confirm(
        "이 여행에서 나갈까요? 이 여행의 기록은 내 여행 목록의 '떼어 낸 기록'으로 남아요. 내 일정, 내 돈, 내 예산은 그대로 고칠 수 있고, 함께 쓰던 일정과 모임 지출은 지금 모습 그대로 보기만 할 수 있어요. 다시 초대받아 들어오면 원래 자리로 돌아가요.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await leaveTripAction(tripId);
      setError(result.error);
    });
  }

  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={linkButtonClass}
      >
        {pending ? "나가는 중…" : "나가기"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
