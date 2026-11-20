import { Fragment } from "react";
import { lineClass, miniLineDots } from "@/lib/day-line";

// 여행 목록의 짧은 노선(#53 설계 §5.4): 날 수만큼 역, 역 테두리 = 그날 노선 색. 꾸밈이라 화면 읽기에서는 숨긴다.
// 선은 역 사이 토막으로 그린다. 역 안쪽을 비워 두어야 줄에 마우스를 올려 바탕이 바뀌어도 역 안이 같은 색이 된다.
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
  const lg = size === "lg";
  const dot = lg ? "size-[18px] border-4" : "size-3 border-[3px]";
  const segment = `shrink-0 bg-rule ${lg ? "h-1.5 w-4" : "h-1 w-2.5"}`;
  return (
    <span
      aria-hidden
      className={`flex w-fit items-center ${dim ? "opacity-55" : ""}`}
    >
      {shown.map((n, i) => (
        <Fragment key={n}>
          {i > 0 && <span className={segment} />}
          <span
            className={`shrink-0 rounded-full ${dot} ${lineClass(n, "border")}`}
          />
        </Fragment>
      ))}
      {hidden > 0 && (
        <>
          <span className={segment} />
          <span className="pl-1 text-xs text-sub">+{hidden}</span>
        </>
      )}
    </span>
  );
}
