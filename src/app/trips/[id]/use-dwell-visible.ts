"use client";

import { useEffect, useState } from "react";

// 요소가 화면(위아래 여유 포함)에 들어와 dwellMs 동안 머물면 true, 나가면 바로 false.
// 일정표가 빠르게 스크롤해 지나간 날의 이동 시간은 묻지 않도록 쓴다(#37 설계 §4.3).
export function useDwellVisible(
  ref: React.RefObject<Element | null>,
  dwellMs = 500,
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (entry?.isIntersecting) {
          timer = setTimeout(() => setVisible(true), dwellMs);
        } else {
          setVisible(false);
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      setVisible(false);
    };
  }, [ref, dwellMs]);

  return visible;
}
