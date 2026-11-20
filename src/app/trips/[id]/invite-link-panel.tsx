"use client";

import { useRef, useState, useTransition } from "react";
import {
  errorTextClass,
  fieldClass,
  secondaryButtonClass,
} from "@/app/ui/styles";
import {
  createInviteLinkAction,
  turnOffInviteLinkAction,
} from "../member-actions";

// 초대 링크(#15 설계 §5.3·§5.4). 원문은 만든 직후 이 화면에서만 보인다(DB 에는 해시만).
export function InviteLinkPanel({
  tripId,
  createdAt,
}: {
  tripId: string;
  createdAt: string | null;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function create() {
    if (
      (link || createdAt) &&
      !window.confirm(
        "지금 링크는 더 이상 쓸 수 없어요. 이미 참여한 사람은 그대로예요.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await createInviteLinkAction(tripId);
      if (result.ok) {
        setLink(`${window.location.origin}/invite/${result.token}`);
        setCopied(false);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  function turnOff() {
    startTransition(async () => {
      const result = await turnOffInviteLinkAction(tripId);
      setError(result.error);
      if (!result.error) setLink(null);
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // 복사할 수 없으면 글자를 골라 두어 직접 복사하게 한다.
      inputRef.current?.select();
    }
  }

  const on = link !== null || createdAt !== null;

  return (
    <div className="flex flex-col gap-2 border-t border-rule pt-3">
      {link ? (
        <>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              readOnly
              value={link}
              aria-label="초대 링크"
              onFocus={(e) => e.currentTarget.select()}
              className={`w-full ${fieldClass} min-w-0 text-sm`}
            />
            <button
              type="button"
              onClick={copy}
              className={`${secondaryButtonClass} shrink-0`}
            >
              {copied ? "복사했어요" : "복사"}
            </button>
          </div>
          <p className="text-sm text-sub">
            이 링크는 지금만 보여요. 다시 보내려면 새 링크를 만드세요.
          </p>
        </>
      ) : (
        on &&
        createdAt && (
          <p className="text-sm text-sub">
            초대 링크가 켜져 있어요 ({formatMadeOn(createdAt)} 만듦)
          </p>
        )
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className={secondaryButtonClass}
        >
          {on ? "새 링크 만들기" : "초대 링크 만들기"}
        </button>
        {on && (
          <button
            type="button"
            onClick={turnOff}
            disabled={pending}
            className={secondaryButtonClass}
          >
            끄기
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={errorTextClass}>
          {error}
        </p>
      )}
    </div>
  );
}

function formatMadeOn(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}
