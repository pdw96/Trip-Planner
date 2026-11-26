import { MiniLine } from "@/app/ui/mini-line";

// 탭 화면 머리의 앱 이름(작은 노선 + "Trip Planner", #122).
export function AppName() {
  return (
    <span className="flex items-center gap-2">
      <MiniLine dayCount={3} />
      <span className="text-lg font-bold">Trip Planner</span>
    </span>
  );
}
