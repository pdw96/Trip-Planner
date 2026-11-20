import { type BudgetSettings, budgetMeter, formatMoney } from "@/lib/budget";

// 예산 카드 머리와 휴대폰 아래 예산 줄이 같이 쓰는 막대·여유 문구(#53 설계 §5.5, §5.4.2).

// 잉크색 채움(예상 총지출 ÷ 총 예산, 100% 상한). 넘으면 막대 전체가 빨강.
export function BudgetBar({
  projected,
  total,
  thin = false,
}: {
  projected: number;
  total: number;
  thin?: boolean;
}) {
  const { percent, over } = budgetMeter(projected, total);
  return (
    <div
      role="img"
      aria-label={over ? "예산 초과" : `예산의 ${Math.round(percent)}%`}
      className={`w-full overflow-hidden rounded-full bg-rule ${thin ? "h-1" : "h-2"}`}
    >
      <div
        className={`h-full rounded-full ${over ? "bg-danger" : "bg-foreground"}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

// 여유(양수)·초과(음수)·딱 맞음.
export function BalanceText({
  balance,
  settings,
}: {
  balance: number;
  settings: BudgetSettings;
}) {
  if (balance === 0) return <span>딱 맞아요</span>;
  return balance < 0 ? (
    <span className="text-danger">
      {formatMoney(-balance, settings.currency)} 초과
    </span>
  ) : (
    <span className="text-ok">
      {formatMoney(balance, settings.currency)} 여유
    </span>
  );
}
