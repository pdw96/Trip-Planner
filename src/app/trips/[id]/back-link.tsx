"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FROM_TAB_KEY } from "@/app/ui/from-tab";

// 여행 화면의 "← 뒤로"(#122 설계 §5.9). 탭 화면에서 여행 링크로 들어왔으면 브라우저 뒤로(보던 스크롤 자리로),
// 아니면(링크로 바로 열기, 새 여행·고치기·초대를 거침) 홈으로 간다. 표시는 마운트 때 읽고 바로 지운다.
// JS 가 없거나 표시가 없으면 그냥 홈 링크다.
export function BackLink() {
  const router = useRouter();
  const [fromTab, setFromTab] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(FROM_TAB_KEY) === "1") setFromTab(true);
      sessionStorage.removeItem(FROM_TAB_KEY);
    } catch {
      // 저장이 막힌 브라우저: 홈 링크로 둔다.
    }
  }, []);

  return (
    <Link
      href="/"
      className="text-sm text-sub hover:underline"
      onClick={(event) => {
        if (!fromTab) return;
        event.preventDefault();
        router.back();
      }}
    >
      ← 뒤로
    </Link>
  );
}
