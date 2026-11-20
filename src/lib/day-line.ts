// 날짜(노선) 색(#53 설계 §5.6). 여덟 색을 돌려 쓴다. node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// Tailwind 는 소스의 글자 그대로를 찾으므로 클래스 이름을 조립하지 않고 표로 적어 둔다.

export const LINE_COUNT = 8;

const CLASSES = {
  bg: [
    "bg-line-1",
    "bg-line-2",
    "bg-line-3",
    "bg-line-4",
    "bg-line-5",
    "bg-line-6",
    "bg-line-7",
    "bg-line-8",
  ],
  text: [
    "text-line-1",
    "text-line-2",
    "text-line-3",
    "text-line-4",
    "text-line-5",
    "text-line-6",
    "text-line-7",
    "text-line-8",
  ],
  border: [
    "border-line-1",
    "border-line-2",
    "border-line-3",
    "border-line-4",
    "border-line-5",
    "border-line-6",
    "border-line-7",
    "border-line-8",
  ],
} as const;

// 1일차 → 1, 8일차 → 8, 9일차 → 1.
export function lineIndex(dayNumber: number): number {
  return ((dayNumber - 1) % LINE_COUNT) + 1;
}

export function lineClass(
  dayNumber: number,
  kind: "bg" | "text" | "border",
): string {
  return CLASSES[kind][lineIndex(dayNumber) - 1];
}

// 목록의 짧은 노선에 보일 일차들. max 보다 길면 앞 max-1 개와 숨긴 개수("+N")를 돌려준다.
export function miniLineDots(
  dayCount: number,
  max: number,
): { shown: number[]; hidden: number } {
  const shownCount = dayCount <= max ? dayCount : max - 1;
  return {
    shown: Array.from({ length: shownCount }, (_, i) => i + 1),
    hidden: dayCount - shownCount,
  };
}
