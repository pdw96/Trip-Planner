// 예산 바텀 시트를 쓸어내려 닫을 때의 판정(#97 설계). 화면 없이 시험할 수 있게 순수 함수로 둔다.

// 이만큼 움직이기 전에는 가로·세로를 정하지 않는다(톡 누르기와 구별).
export const AXIS_SLOP = 8;

const CLOSE_DISTANCE = 120;
const CLOSE_RATIO = 0.25;
const FLICK_MIN = 24;
const FLICK_SPEED = 0.5; // px/ms

export function dragAxis(dx: number, dy: number): "x" | "y" | null {
  if (Math.hypot(dx, dy) < AXIS_SLOP) return null;
  return Math.abs(dy) > Math.abs(dx) ? "y" : "x";
}

// dy: 아래로 끈 거리(px), ms: 끈 시간, height: 시트 높이(px).
export function shouldCloseSheet(
  dy: number,
  ms: number,
  height: number,
): boolean {
  if (dy <= 0) return false;
  if (dy >= Math.min(CLOSE_DISTANCE, height * CLOSE_RATIO)) return true;
  return ms > 0 && dy >= FLICK_MIN && dy / ms >= FLICK_SPEED;
}
