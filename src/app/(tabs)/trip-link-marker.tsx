"use client";

import { useEffect } from "react";
import { FROM_TAB_KEY } from "@/app/ui/from-tab";

// 탭 화면에서 여행 링크를 누르면 표시를 남긴다(#122 설계 §5.9). 여행 화면의 "← 뒤로"가 이 표시를 보고
// 브라우저 뒤로(보던 스크롤 자리로)를 쓸지, 홈으로 갈지 고른다. 그리는 것은 없다.
// 숨은 화면(cacheComponents)에 남아도 누른 때의 주소가 탭 화면일 때만 남긴다. 새 여행(/trips/new)은 양식이라 뺀다.
const TAB_PATHS = new Set(["/", "/together", "/mine"]);
const TRIP_LINK = 'a[href^="/trips/"]:not([href="/trips/new"])';

export function TripLinkMarker() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
      if (event.shiftKey || event.altKey) return;
      if (!TAB_PATHS.has(window.location.pathname)) return;
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest(TRIP_LINK)) return;
      try {
        sessionStorage.setItem(FROM_TAB_KEY, "1");
      } catch {
        // 저장이 막힌 브라우저: "← 뒤로"는 홈으로 간다.
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
