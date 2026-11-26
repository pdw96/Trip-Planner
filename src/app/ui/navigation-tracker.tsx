"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// 이 브라우저 탭에서 직전에 본 앱 주소(#122 설계 §5.9). 여행 화면의 "← 뒤로"가 직전 화면이 탭 화면이면 브라우저 뒤로,
// 아니면 홈으로 가는 데 쓴다. 앱 안 이동(클라이언트)에서만 이어지고, 새로 고치거나 링크로 바로 열면 비어 있다(→ 홈).
// 주소만 보므로 같은 화면의 새로 고침(revalidate·router.refresh)이나 숨긴 화면(Activity)이 다시 보이는 것에 흔들리지 않는다.
let current: string | null = null;
let previous: string | null = null;

const TAB_PATHS = new Set(["/", "/together", "/mine"]);

export function cameFromTab(): boolean {
  return previous !== null && TAB_PATHS.has(previous);
}

export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    // 개발 모드의 effect 두 번 실행에도 같은 주소는 한 번만 센다.
    if (pathname === current) return;
    previous = current;
    current = pathname;
  }, [pathname]);
  return null;
}
