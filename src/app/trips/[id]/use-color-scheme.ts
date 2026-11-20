"use client";

import { useSyncExternalStore } from "react";

// 기기의 밝게·어둡게 설정. 지도(ColorScheme.FOLLOW_SYSTEM)와 같은 기준으로 지도 선 색을 고른다(#53 §5.6).
// 서버에서 그릴 때는 밝게로 본다.
const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useColorScheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(QUERY).matches ? "dark" : "light"),
    () => "light",
  );
}
