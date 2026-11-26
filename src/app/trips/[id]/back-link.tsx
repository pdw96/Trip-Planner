"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cameFromTab } from "@/app/ui/navigation-tracker";

// 여행 화면의 "← 뒤로"(#122 설계 §5.9). 직전 화면이 탭 화면(홈·함께·내 여행)이면 브라우저 뒤로(보던 스크롤 자리로),
// 아니면(링크로 바로 열기, 새 여행·고치기·초대를 거침) 홈으로 간다. 누르는 때에 판단한다. JS 가 없으면 그냥 홈 링크다.
export function BackLink() {
  const router = useRouter();
  return (
    <Link
      href="/"
      className="text-sm text-sub hover:underline"
      onClick={(event) => {
        if (!cameFromTab()) return;
        event.preventDefault();
        router.back();
      }}
    >
      ← 뒤로
    </Link>
  );
}
