"use client";

import { useEffect, useState } from "react";
import {
  detectInAppBrowser,
  type InAppBrowser,
  kakaoOpenExternalUrl,
} from "@/lib/in-app-browser";

// 앱 안 브라우저 안내(#15 설계 §5.7). Google 은 앱 안 브라우저에서 로그인을 거부한다.
// 카톡이면 같은 주소를 바깥 브라우저로 다시 열고, 그 밖 앱이면 안내만 한다.
// 서버 렌더와 첫 렌더에는 아무것도 그리지 않는다(사용자 에이전트는 마운트 뒤에 본다).
export function InAppBrowserNotice() {
  const [kind, setKind] = useState<InAppBrowser>(null);
  const [href, setHref] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const detected = detectInAppBrowser(navigator.userAgent);
    const here = window.location.href;
    setKind(detected);
    setHref(here);
    if (detected === "kakaotalk") {
      window.location.href = kakaoOpenExternalUrl(here);
    }
  }, []);

  if (!kind) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex max-w-sm flex-col items-center gap-3 rounded-[14px] bg-warn-surface px-5 py-4 text-sm text-warn">
      <p>
        {kind === "kakaotalk"
          ? "브라우저에서 열었어요. 열리지 않으면 아래 버튼을 눌러 주세요."
          : "Google 로그인은 이 앱 안에서는 안 돼요. 크롬이나 사파리에서 열어 주세요."}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {kind === "kakaotalk" && (
          <a
            href={kakaoOpenExternalUrl(href)}
            className="font-medium underline"
          >
            브라우저로 열기
          </a>
        )}
        <button type="button" onClick={copy} className="font-medium underline">
          {copied ? "복사했어요" : "링크 복사"}
        </button>
      </div>
    </div>
  );
}
