// 결제일 기준환율(Frankfurter, 유럽중앙은행) 주소와 응답 해석(#14 설계 §5.4).
// node --test 로 시험하므로 다른 모듈을 import 하지 않는다. 받기는 fx-api.ts(server-only)가 한다.

const RATE_MAX_DECIMALS = 10;

export function frankfurterUrl(date: string, from: string, to: string): string {
  return `https://api.frankfurter.dev/v1/${date}?base=${from}&symbols=${to}`;
}

// { date, rates: { [to]: number } } 에서 환율 글자(소수 10자리까지)와 그 환율의 날짜(주말이면 전 영업일).
export function parseFrankfurterRate(
  body: unknown,
  to: string,
): { rate: string; rateDate: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { date, rates } = body as { date?: unknown; rates?: unknown };
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  if (typeof rates !== "object" || rates === null) return null;
  const value = (rates as Record<string, unknown>)[to];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const rate = value
    .toFixed(RATE_MAX_DECIMALS)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
  if (/^0(\.0*)?$/.test(rate)) return null;
  return { rate, rateDate: date };
}
