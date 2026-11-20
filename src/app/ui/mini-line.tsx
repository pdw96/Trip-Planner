import { lineClass, miniLineDots } from "@/lib/day-line";

// 여행 목록의 짧은 노선(#53 설계 §5.4): 날 수만큼 역, 역 테두리 = 그날 노선 색. 꾸밈이라 화면 읽기에서는 숨긴다.
const MAX_DOTS = 14;

export function MiniLine({
  dayCount,
  dim = false,
  size = "sm",
}: {
  dayCount: number;
  dim?: boolean;
  size?: "sm" | "lg";
}) {
  const { shown, hidden } = miniLineDots(dayCount, MAX_DOTS);
  const dot = size === "lg" ? "size-[18px] border-4" : "size-3 border-[3px]";
  return (
    <span
      aria-hidden
      className={`relative flex w-fit items-center ${size === "lg" ? "gap-4" : "gap-2.5"} ${dim ? "opacity-55" : ""}`}
    >
      <span
        className={`absolute inset-x-1.5 rounded bg-rule ${size === "lg" ? "h-1.5" : "h-1"}`}
      />
      {shown.map((n) => (
        <span
          key={n}
          className={`relative shrink-0 rounded-full bg-background ${dot} ${lineClass(n, "border")}`}
        />
      ))}
      {hidden > 0 && (
        <span className="relative bg-background pr-1 text-xs text-sub">
          +{hidden}
        </span>
      )}
    </span>
  );
}
