// 예산 바텀 시트를 쓸어내려 닫을 때의 판정(#97 설계). 화면 없이 시험할 수 있게 순수 함수로 둔다.

// 이만큼 움직이기 전에는 가로·세로를 정하지 않는다(톡 누르기와 구별).
export const AXIS_SLOP = 8;

const CLOSE_DISTANCE = 120;
const CLOSE_RATIO = 0.25;
const FLICK_MIN = 24;
const FLICK_SPEED = 0.5; // px/ms
// 놓기 직전 속도를 잴 때 보는 최근 구간(ms). 처음에 머뭇거린 시간이 속도를 깎지 않게.
const VELOCITY_WINDOW = 100;

export type DragSample = { y: number; t: number };

export function dragAxis(dx: number, dy: number): "x" | "y" | null {
  if (Math.hypot(dx, dy) < AXIS_SLOP) return null;
  return Math.abs(dy) > Math.abs(dx) ? "y" : "x";
}

// samples: 끄는 동안의 (y, 시각) 기록, now: 놓은 시각. 최근 VELOCITY_WINDOW 안 첫 기록부터 마지막 기록까지의 속도(px/ms).
export function releaseVelocity(samples: DragSample[], now: number): number {
  const last = samples.at(-1);
  const first = samples.find((s) => s.t >= now - VELOCITY_WINDOW);
  if (!last || !first || last.t <= first.t) return 0;
  return (last.y - first.y) / (last.t - first.t);
}

// dy: 아래로 끈 거리(px), velocity: 놓기 직전 속도(px/ms, 아래가 +), height: 시트 높이(px).
export function shouldCloseSheet(
  dy: number,
  velocity: number,
  height: number,
): boolean {
  if (dy <= 0) return false;
  if (dy >= Math.min(CLOSE_DISTANCE, height * CLOSE_RATIO)) return true;
  return dy >= FLICK_MIN && velocity >= FLICK_SPEED;
}
