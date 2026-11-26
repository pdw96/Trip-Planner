"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FROM_TAB_KEY } from "@/app/ui/from-tab";

// 여행 화면의 "← 뒤로"(#122 설계 §5.9). 탭 화면에서 여행 링크로 들어왔으면 브라우저 뒤로(보던 스크롤 자리로),
// 아니면(링크로 바로 열기, 새 여행·고치기·초대를 거침) 홈으로 간다. JS 가 없으면 그냥 홈 링크다.
//
// "탭에서 왔음"은 컴포넌트 state 가 아니라 이 브라우저 기록 항목(history.state)에 붙인다.
// - 숨긴 화면(cacheComponents 의 Activity)은 state 를 그대로 가진 채 다시 보이므로, state 로 두면 고치기를 거쳐 돌아온
//   같은 여행 화면이 옛 값을 쓴다. 기록 항목은 고치기 저장 뒤 새로 생기므로 표시가 없다.
// - 개발 모드에서 effect 가 두 번 돌아도, 첫 번째가 표시를 옮겨 두면 두 번째는 건드리지 않는다.
const HISTORY_FLAG = "tpFromTab";

export function BackLink() {
  const router = useRouter();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(FROM_TAB_KEY) !== "1") return;
      sessionStorage.removeItem(FROM_TAB_KEY);
      window.history.replaceState(
        { ...window.history.state, [HISTORY_FLAG]: true },
        "",
      );
    } catch {
      // 저장이 막힌 브라우저: 홈 링크로 둔다.
    }
  }, []);

  return (
    <Link
      href="/"
      className="text-sm text-sub hover:underline"
      onClick={(event) => {
        if (window.history.state?.[HISTORY_FLAG] !== true) return;
        event.preventDefault();
        router.back();
      }}
    >
      ← 뒤로
    </Link>
  );
}
