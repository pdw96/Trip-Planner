"use client";

import { useState, useTransition } from "react";
import { leaveTripAction, removeMemberAction } from "../member-actions";

const linkButtonClass =
  "shrink-0 text-sm text-red-600 hover:underline disabled:opacity-50";

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
        `${name}님을 내보낼까요? 링크가 켜져 있으면 다시 들어올 수 있어요. 막으려면 새 링크를 만드세요.`,
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
        <span role="alert" className="text-xs text-red-600">
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
        "이 여행에서 나갈까요? 다시 들어오려면 새 초대 링크가 필요해요.",
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
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
