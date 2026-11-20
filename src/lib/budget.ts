// 예산 돈 계산(#14, 설계 §5.3). 서버·클라이언트가 함께 쓰고 node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 금액은 통화 최소 단위 정수(상한 10^12 미만), 환율은 "현지 통화 1 = 예산 통화 몇" 소수 글자(소수 10자리까지).
// 부동소수점 곱셈을 쓰지 않는다: 금액은 글자로 해석하고, 환율 곱은 BigInt 로 한다.

export type CurrencyInfo = {
  code: string;
  label: string;
  symbol: string;
  digits: number;
  // 유럽중앙은행 기준환율(Frankfurter)에 있는가.
  ecb: boolean;
  // 환율을 보이고 입력받는 단위(엔·동·루피아는 100 단위, 설계 §5.7.1).
  rateUnit: 1 | 100;
};

// 고를 수 있는 통화. 자릿수는 Intl 에 기대지 않는다(런타임 데이터가 바뀌면 저장된 최소 단위의 뜻이 바뀐다).
export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: "KRW", label: "원", symbol: "₩", digits: 0, ecb: true, rateUnit: 1 },
  {
    code: "JPY",
    label: "엔",
    symbol: "¥",
    digits: 0,
    ecb: true,
    rateUnit: 100,
  },
  {
    code: "USD",
    label: "미국 달러",
    symbol: "$",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
  {
    code: "EUR",
    label: "유로",
    symbol: "€",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
  {
    code: "CNY",
    label: "위안",
    symbol: "CN¥",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
  {
    code: "HKD",
    label: "홍콩 달러",
    symbol: "HK$",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
  {
    code: "TWD",
    label: "대만 달러",
    symbol: "NT$",
    digits: 2,
    ecb: false,
    rateUnit: 1,
  },
  {
    code: "THB",
    label: "바트",
    symbol: "฿",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
  {
    code: "VND",
    label: "동",
    symbol: "₫",
    digits: 0,
    ecb: false,
    rateUnit: 100,
  },
  {
    code: "SGD",
    label: "싱가포르 달러",
    symbol: "S$",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
  {
    code: "PHP",
    label: "필리핀 페소",
    symbol: "₱",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
  {
    code: "MYR",
    label: "링깃",
    symbol: "RM",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
  {
    code: "IDR",
    label: "루피아",
    symbol: "Rp",
    digits: 0,
    ecb: true,
    rateUnit: 100,
  },
  {
    code: "GBP",
    label: "파운드",
    symbol: "£",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
  {
    code: "AUD",
    label: "호주 달러",
    symbol: "A$",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
  {
    code: "CAD",
    label: "캐나다 달러",
    symbol: "C$",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
  {
    code: "CHF",
    label: "스위스 프랑",
    symbol: "CHF ",
    digits: 2,
    ecb: true,
    rateUnit: 1,
  },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currencyInfo(code: string): CurrencyInfo | null {
  return BY_CODE.get(code) ?? null;
}

// 이 값 미만만 허용(최소 단위).
export const MAX_AMOUNT_MINOR = 10 ** 12;
// tsconfig 대상(ES2017)은 BigInt 글자(10n)를 받지 않아 BigInt() 로 만든다.
const B2 = BigInt(2);
const B10 = BigInt(10);
const MAX_AMOUNT_BIG = B10 ** BigInt(12);
const RATE_MAX_DECIMALS = 10;
const RATE_MAX_INT_DIGITS = 10;

export type Money = { amount: number; currency: string };
export type RateSource = "ecb" | "manual" | "planned";
export type ActualMoney = Money & {
  paidOn: string | null;
  rate: string | null;
  rateSource: RateSource | null;
};

export type BudgetSettings = {
  currency: string;
  totalAmount: number;
  localCurrency: string | null;
  plannedRate: string | null;
};

// date: 일정에 붙은 행은 일정 날짜, 일정 밖 행은 그 행의 날짜(없으면 여행 전체).
export type BudgetLine = {
  id: string;
  scheduleItemId: string | null;
  title: string | null;
  date: string | null;
  estimate: Money | null;
  actual: ActualMoney | null;
};

const AMOUNT_INVALID = "금액을 숫자로 적어 주세요.";
const AMOUNT_TOO_LARGE = "금액이 너무 커요.";
const RATE_INVALID = "환율을 0보다 큰 숫자로 적어 주세요.";
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

function digitsOf(currency: string): number {
  return currencyInfo(currency)?.digits ?? 0;
}

function decimalsError(digits: number): string {
  return digits === 0
    ? "소수점 없이 적어 주세요."
    : `소수점 아래는 ${digits}자리까지 적을 수 있어요.`;
}

// 쉼표·앞뒤 공백을 지운 소수 글자, 형식이 틀리면 null.
function cleanDecimal(text: string): { int: string; frac: string } | null {
  const cleaned = text.trim().replaceAll(",", "");
  if (!DECIMAL_PATTERN.test(cleaned)) return null;
  const [int, frac = ""] = cleaned.split(".");
  return { int, frac };
}

// 앞의 0, 소수 끝의 0 을 지운 표준 글자("9.2", "1380.5", "0.0067").
function canonical(int: string, frac: string): string {
  const i = int.replace(/^0+(?=\d)/, "") || "0";
  const f = frac.replace(/0+$/, "");
  return f ? `${i}.${f}` : i;
}

// 소수점을 places 칸 옮긴다(양수 = 오른쪽 = 곱하기 10^places).
function shiftDecimal(int: string, frac: string, places: number) {
  const all = int + frac;
  const point = int.length + places;
  if (point <= 0) return { int: "0", frac: "0".repeat(-point) + all };
  if (point >= all.length) {
    return { int: all + "0".repeat(point - all.length), frac: "" };
  }
  return { int: all.slice(0, point), frac: all.slice(point) };
}

function isZero(int: string, frac: string): boolean {
  return /^0*$/.test(int + frac);
}

export function parseAmount(
  text: string,
  currency: string,
): { ok: true; minor: number | null } | { ok: false; error: string } {
  if (text.trim() === "") return { ok: true, minor: null };
  const parts = cleanDecimal(text);
  if (!parts) return { ok: false, error: AMOUNT_INVALID };
  const digits = digitsOf(currency);
  if (parts.frac.length > digits) {
    return { ok: false, error: decimalsError(digits) };
  }
  const minor = BigInt(parts.int + parts.frac.padEnd(digits, "0"));
  if (minor >= MAX_AMOUNT_BIG) return { ok: false, error: AMOUNT_TOO_LARGE };
  return { ok: true, minor: Number(minor) };
}

function splitMinor(minor: number, digits: number) {
  const s = String(Math.trunc(minor)).padStart(digits + 1, "0");
  return {
    int: s.slice(0, s.length - digits),
    frac: digits > 0 ? s.slice(s.length - digits) : "",
  };
}

export function formatMoney(minor: number, currency: string): string {
  const info = currencyInfo(currency);
  const digits = info?.digits ?? 0;
  const sign = minor < 0 ? "-" : "";
  const { int, frac } = splitMinor(Math.abs(minor), digits);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${info?.symbol ?? `${currency} `}${grouped}${frac ? `.${frac}` : ""}`;
}

export function amountInputValue(minor: number, currency: string): string {
  const { int, frac } = splitMinor(minor, digitsOf(currency));
  return frac ? `${int}.${frac}` : int;
}

function unitPlaces(unit: 1 | 100): number {
  return unit === 100 ? 2 : 0;
}

export function parseRateInput(
  text: string,
  unit: 1 | 100,
): { ok: true; rate: string } | { ok: false; error: string } {
  const parts = cleanDecimal(text);
  if (!parts || isZero(parts.int, parts.frac)) {
    return { ok: false, error: RATE_INVALID };
  }
  const shifted = shiftDecimal(parts.int, parts.frac, -unitPlaces(unit));
  const rate = canonical(shifted.int, shifted.frac);
  const [int, frac = ""] = rate.split(".");
  if (frac.length > RATE_MAX_DECIMALS) {
    return { ok: false, error: RATE_INVALID };
  }
  // DB 칸이 numeric(20,10) 이라 정수부는 10자리까지다.
  if (int.length > RATE_MAX_INT_DIGITS) {
    return { ok: false, error: "환율이 너무 커요." };
  }
  return { ok: true, rate };
}

export function rateInputValue(rate: string, unit: 1 | 100): string {
  const parts = cleanDecimal(rate);
  if (!parts) return "";
  const shifted = shiftDecimal(parts.int, parts.frac, unitPlaces(unit));
  return canonical(shifted.int, shifted.frac);
}

// DB 의 numeric 글자("9.2000000000")를 표준 글자로. 양수가 아니거나 소수 10자리를 넘으면 null.
export function normalizeRate(text: string): string | null {
  const parts = cleanDecimal(text);
  if (!parts || isZero(parts.int, parts.frac)) return null;
  const rate = canonical(parts.int, parts.frac);
  if ((rate.split(".")[1] ?? "").length > RATE_MAX_DECIMALS) return null;
  return rate;
}

// 금액을 예산 통화 최소 단위로. 같은 통화면 그대로, 다르면 환율을 곱해 가장 가까운 최소 단위로(0.5 는 올림).
// 환율이 없으면(있을 수 없는 상태: 현지 통화에는 예정 환율이 늘 있다) 0 으로 본다.
export function toBudgetMinor(
  money: Money,
  rate: string | null,
  budgetCurrency: string,
): number {
  if (money.currency === budgetCurrency) return money.amount;
  const parts = rate === null ? null : cleanDecimal(rate);
  if (!parts) return 0;
  const num = BigInt(parts.int + parts.frac);
  const den = B10 ** BigInt(parts.frac.length);
  const top =
    BigInt(money.amount) * num * B10 ** BigInt(digitsOf(budgetCurrency));
  const bottom = den * B10 ** BigInt(digitsOf(money.currency));
  return Number((B2 * top + bottom) / (B2 * bottom));
}

function estimateIn(line: BudgetLine, settings: BudgetSettings): number | null {
  if (!line.estimate) return null;
  return toBudgetMinor(line.estimate, settings.plannedRate, settings.currency);
}

function actualIn(line: BudgetLine, settings: BudgetSettings): number | null {
  if (!line.actual) return null;
  return toBudgetMinor(line.actual, line.actual.rate, settings.currency);
}

export type BudgetSummary = {
  total: number;
  // 계획 합계 E
  planned: number;
  // 실제 합계 A
  actual: number;
  // 실제가 있는 항목의 Σ(실제 − 예상), 예상 없으면 0 으로 D
  actualOverPlan: number;
  // 그중 계획에 없던 지출(예상 없이 실제만) 합계 U
  unplanned: number;
  // 실제가 아직 없는 항목의 예상 R
  remaining: number;
  // 예상 총지출 P = A + R
  projected: number;
  // 여유(음수면 초과) B − P
  balance: number;
  hasActual: boolean;
};

// 모두 예산 통화 최소 단위. "지금까지"를 날짜로 자르지 않는다(§5.3).
export function summarizeBudget(
  lines: BudgetLine[],
  settings: BudgetSettings,
): BudgetSummary {
  let planned = 0;
  let actual = 0;
  let actualOverPlan = 0;
  let unplanned = 0;
  let remaining = 0;
  let hasActual = false;
  for (const line of lines) {
    const e = estimateIn(line, settings);
    const a = actualIn(line, settings);
    if (e !== null) planned += e;
    if (a !== null) {
      hasActual = true;
      actual += a;
      actualOverPlan += a - (e ?? 0);
      if (e === null) unplanned += a;
    } else if (e !== null) {
      remaining += e;
    }
  }
  const projected = actual + remaining;
  return {
    total: settings.totalAmount,
    planned,
    actual,
    actualOverPlan,
    unplanned,
    remaining,
    projected,
    balance: settings.totalAmount - projected,
    hasActual,
  };
}

export type PeriodTotal = {
  estimate: number;
  actual: number;
  diff: number | null;
  // 그 기간 금액이 모두 한 통화면 그 통화로 낸 합계.
  native: {
    currency: string;
    estimate: number;
    actual: number;
    diff: number | null;
  } | null;
};

type PeriodAcc = {
  total: PeriodTotal;
  currencies: Set<string>;
  nativeEstimate: number;
  nativeActual: number;
  nativeDiff: number | null;
};

function addTo(acc: PeriodAcc, line: BudgetLine, settings: BudgetSettings) {
  const e = estimateIn(line, settings);
  const a = actualIn(line, settings);
  if (line.estimate) {
    acc.currencies.add(line.estimate.currency);
    acc.nativeEstimate += line.estimate.amount;
  }
  if (line.actual) {
    acc.currencies.add(line.actual.currency);
    acc.nativeActual += line.actual.amount;
    acc.nativeDiff =
      (acc.nativeDiff ?? 0) + line.actual.amount - (line.estimate?.amount ?? 0);
  }
  if (e !== null) acc.total.estimate += e;
  if (a !== null) {
    acc.total.actual += a;
    acc.total.diff = (acc.total.diff ?? 0) + a - (e ?? 0);
  }
}

function finish(acc: PeriodAcc): PeriodTotal {
  const [only] = acc.currencies;
  return {
    ...acc.total,
    native:
      acc.currencies.size === 1
        ? {
            currency: only,
            estimate: acc.nativeEstimate,
            actual: acc.nativeActual,
            diff: acc.nativeDiff,
          }
        : null,
  };
}

function newAcc(): PeriodAcc {
  return {
    total: { estimate: 0, actual: 0, diff: null, native: null },
    currencies: new Set(),
    nativeEstimate: 0,
    nativeActual: 0,
    nativeDiff: null,
  };
}

// 날짜 없음 → tripWide(여행 전체 항목), 여행 기간 안 → byDate(금액 있는 날만), 기간 밖 → outside.
export function totalsByPeriod(
  lines: BudgetLine[],
  settings: BudgetSettings,
  tripStart: string,
  tripEnd: string,
): {
  tripWide: PeriodTotal;
  byDate: Record<string, PeriodTotal>;
  outside: PeriodTotal | null;
} {
  const tripWide = newAcc();
  const byDate = new Map<string, PeriodAcc>();
  let outside: PeriodAcc | null = null;
  for (const line of lines) {
    let acc: PeriodAcc;
    if (line.date === null) {
      acc = tripWide;
    } else if (line.date >= tripStart && line.date <= tripEnd) {
      acc = byDate.get(line.date) ?? newAcc();
      byDate.set(line.date, acc);
    } else {
      outside ??= newAcc();
      acc = outside;
    }
    addTo(acc, line, settings);
  }
  return {
    tripWide: finish(tripWide),
    byDate: Object.fromEntries(
      [...byDate].map(([date, acc]) => [date, finish(acc)]),
    ),
    outside: outside === null ? null : finish(outside),
  };
}

export type RateDecision =
  | { kind: "none" }
  | { kind: "keep"; rate: string; source: RateSource }
  | { kind: "manual"; rate: string }
  | { kind: "planned" }
  | { kind: "fetch" };

// 실제 지출의 환율을 어떻게 정할지(§5.4). rateField: 정규화된 환율 칸 값(빈칸 ""), undefined = 칸이 없던 입력.
export function decideRate(input: {
  currency: string;
  paidOn: string;
  rateField: string | undefined;
  previous: ActualMoney | null;
  settings: BudgetSettings;
  today: string;
}): RateDecision {
  const { currency, paidOn, rateField, previous, settings, today } = input;
  if (currency === settings.currency) return { kind: "none" };
  if (
    rateField !== undefined &&
    rateField !== "" &&
    rateField !== previous?.rate
  ) {
    return { kind: "manual", rate: rateField };
  }
  if (
    previous &&
    previous.currency === currency &&
    previous.paidOn === paidOn &&
    previous.rate !== null &&
    (previous.rateSource === "ecb" || previous.rateSource === "manual") &&
    (rateField === undefined || rateField === previous.rate)
  ) {
    return { kind: "keep", rate: previous.rate, source: previous.rateSource };
  }
  if (
    paidOn > today ||
    !currencyInfo(currency)?.ecb ||
    !currencyInfo(settings.currency)?.ecb
  ) {
    return { kind: "planned" };
  }
  return { kind: "fetch" };
}
