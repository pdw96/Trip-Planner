import { budgetMeter, formatMoney } from "@/lib/budget";

// 예산 카드 머리와 아래 예산 줄이 같이 쓰는 막대·여유 문구(#53 설계 §5.5, §5.4.2).

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
    // span: 아래 예산 줄에서는 버튼 안에 들어간다(버튼 안에는 div 를 둘 수 없다).
    <span
      role="img"
      aria-label={over ? "예산 초과" : `예산의 ${Math.round(percent)}%`}
      className={`block w-full overflow-hidden rounded-full bg-rule ${thin ? "h-1" : "h-2"}`}
    >
      <span
        className={`block h-full rounded-full ${over ? "bg-danger" : "bg-foreground"}`}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

// 여유(양수)·초과(음수)·딱 맞음.
export function BalanceText({
  balance,
  currency,
}: {
  balance: number;
  currency: string;
}) {
  if (balance === 0) return <span>딱 맞아요</span>;
  return balance < 0 ? (
    <span className="text-danger">{formatMoney(-balance, currency)} 초과</span>
  ) : (
    <span className="text-ok">{formatMoney(balance, currency)} 여유</span>
  );
}

// 자물쇠(#89 내 예산·내 돈 표시). 글자 색을 따른다.
export function LockIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="size-3.5 shrink-0"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

// "나만 보여요"(자물쇠 + 글자). 내 예산 카드 제목·설정 양식의 내 예산 칸 옆.
export function PrivateBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-sub">
      <LockIcon />
      나만 보여요
    </span>
  );
}
