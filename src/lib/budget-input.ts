// 예산 양식 검증(#14). node --test 로 시험하므로 다른 모듈을 import 하지 않는다.
// 금액·환율 해석은 budget.ts 의 함수를 부르는 쪽이 인자(MoneyParsers)로 넘긴다.

type CurrencyLike = { digits: number; rateUnit: 1 | 100 };

export type MoneyParsers = {
  parseAmount: (
    text: string,
    currency: string,
  ) => { ok: true; minor: number | null } | { ok: false; error: string };
  parseRateInput: (
    text: string,
    unit: 1 | 100,
  ) => { ok: true; rate: string } | { ok: false; error: string };
  currencyInfo: (code: string) => CurrencyLike | null;
};

const CURRENCY_INVALID = "통화를 다시 골라 주세요.";
export const EXTRA_TITLE_MAX = 100;

// trip-input.ts 의 isValidIsoDate 와 같은 규칙(순수 모듈 규칙 때문에 다시 둔다).
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value;
}

// --- 예산 설정 ---

// localCurrency 빈칸 = 없음. plannedRate 는 현지 통화의 rateUnit 단위 글자(엔이면 100엔당).
export type BudgetSettingsFields = {
  totalAmount: string;
  currency: string;
  localCurrency: string;
  plannedRate: string;
};

export const EMPTY_BUDGET_SETTINGS_FIELDS: BudgetSettingsFields = {
  totalAmount: "",
  currency: "KRW",
  localCurrency: "",
  plannedRate: "",
};

type Errors<T> = Partial<Record<keyof T, string>>;

export function parseBudgetSettings(
  f: BudgetSettingsFields,
  p: MoneyParsers,
):
  | {
      ok: true;
      value: {
        currency: string;
        totalAmount: number;
        localCurrency: string | null;
        plannedRate: string | null;
      };
    }
  | { ok: false; errors: Errors<BudgetSettingsFields> } {
  const errors: Errors<BudgetSettingsFields> = {};
  const currency = f.currency;
  const currencyOk = p.currencyInfo(currency) !== null;
  if (!currencyOk) errors.currency = CURRENCY_INVALID;

  let totalAmount = 0;
  if (currencyOk) {
    const total = p.parseAmount(f.totalAmount, currency);
    if (!total.ok) errors.totalAmount = total.error;
    else if (total.minor === null)
      errors.totalAmount = "총 예산을 적어 주세요.";
    else totalAmount = total.minor;
  }

  const localCurrency = f.localCurrency === "" ? null : f.localCurrency;
  let plannedRate: string | null = null;
  if (localCurrency !== null) {
    const local = p.currencyInfo(localCurrency);
    if (!local) {
      errors.localCurrency = CURRENCY_INVALID;
    } else if (localCurrency === currency) {
      errors.localCurrency = "현지 통화는 예산 통화와 달라야 해요.";
    } else if (f.plannedRate.trim() === "") {
      errors.plannedRate = "현지 통화를 쓰려면 예정 환율을 적어 주세요.";
    } else {
      const rate = p.parseRateInput(f.plannedRate, local.rateUnit);
      if (!rate.ok) errors.plannedRate = rate.error;
      else plannedRate = rate.rate;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { currency, totalAmount, localCurrency, plannedRate },
  };
}

// --- 예상·실제 칸 ---

export type AmountFields = {
  estimateAmount: string;
  estimateCurrency: string;
  actualAmount: string;
  actualCurrency: string;
  actualPaidOn: string;
  actualRate: string;
};

export const EMPTY_AMOUNT_FIELDS: AmountFields = {
  estimateAmount: "",
  estimateCurrency: "",
  actualAmount: "",
  actualCurrency: "",
  actualPaidOn: "",
  actualRate: "",
};

export type AllowedCurrencies = {
  currency: string;
  localCurrency: string | null;
};

// rateField: 정규화된 환율 칸 값(빈칸 ""), undefined = 현지 통화가 아니어서 환율이 없음.
export type ParsedAmounts = {
  estimate: { amount: number; currency: string } | null;
  actual: {
    amount: number;
    currency: string;
    paidOn: string | null;
    rateField: string | undefined;
  } | null;
};

// 통화 칸이 비면 현지 통화(있으면), 아니면 예산 통화. 이 여행의 두 통화가 아니면 null.
function pickCurrency(text: string, allowed: AllowedCurrencies): string | null {
  const code = text === "" ? (allowed.localCurrency ?? allowed.currency) : text;
  return code === allowed.currency || code === allowed.localCurrency
    ? code
    : null;
}

export function parseAmountFields(
  f: AmountFields,
  allowed: AllowedCurrencies,
  p: MoneyParsers,
  opts: { actualShown: boolean; defaultPaidOn: string },
):
  | { ok: true; value: ParsedAmounts & { actualTouched: boolean } }
  | { ok: false; errors: Errors<AmountFields> } {
  const errors: Errors<AmountFields> = {};

  let estimate: ParsedAmounts["estimate"] = null;
  if (f.estimateAmount.trim() !== "") {
    const currency = pickCurrency(f.estimateCurrency, allowed);
    if (currency === null) {
      errors.estimateCurrency = CURRENCY_INVALID;
    } else {
      const parsed = p.parseAmount(f.estimateAmount, currency);
      if (!parsed.ok) errors.estimateAmount = parsed.error;
      else if (parsed.minor !== null) {
        estimate = { amount: parsed.minor, currency };
      }
    }
  }

  let actual: ParsedAmounts["actual"] = null;
  if (opts.actualShown && f.actualAmount.trim() !== "") {
    const currency = pickCurrency(f.actualCurrency, allowed);
    if (currency === null) {
      errors.actualCurrency = CURRENCY_INVALID;
    } else {
      const parsed = p.parseAmount(f.actualAmount, currency);
      if (!parsed.ok) errors.actualAmount = parsed.error;
      else if (parsed.minor !== null) {
        actual = {
          amount: parsed.minor,
          currency,
          paidOn: null,
          rateField: undefined,
        };
        if (currency !== allowed.currency) {
          const paidOn = f.actualPaidOn.trim();
          if (paidOn === "") actual.paidOn = opts.defaultPaidOn;
          else if (isValidIsoDate(paidOn)) actual.paidOn = paidOn;
          else errors.actualPaidOn = "결제일을 다시 골라 주세요.";

          const rateText = f.actualRate.trim();
          if (rateText === "") {
            actual.rateField = "";
          } else {
            const unit = p.currencyInfo(currency)?.rateUnit ?? 1;
            const rate = p.parseRateInput(rateText, unit);
            if (!rate.ok) errors.actualRate = rate.error;
            else actual.rateField = rate.rate;
          }
        }
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { estimate, actual, actualTouched: opts.actualShown },
  };
}

// --- 일정 밖 항목 ---

// date 빈칸 = 여행 전체(날짜 없음).
export type ExtraItemFields = AmountFields & { title: string; date: string };

export const EMPTY_EXTRA_ITEM_FIELDS: ExtraItemFields = {
  ...EMPTY_AMOUNT_FIELDS,
  title: "",
  date: "",
};

export function parseExtraItem(
  f: ExtraItemFields,
  allowed: AllowedCurrencies,
  p: MoneyParsers,
  opts: { defaultPaidOn: string; tripDates: string[] },
):
  | { ok: true; value: { title: string; date: string | null } & ParsedAmounts }
  | { ok: false; errors: Errors<ExtraItemFields> } {
  const errors: Errors<ExtraItemFields> = {};
  const title = f.title.trim();
  if (title === "") errors.title = "이름을 적어 주세요.";
  else if ([...title].length > EXTRA_TITLE_MAX) {
    errors.title = `이름은 ${EXTRA_TITLE_MAX}자까지 적을 수 있어요.`;
  }

  const date = f.date === "" ? null : f.date;
  if (date !== null && !opts.tripDates.includes(date)) {
    errors.date = "날짜를 다시 골라 주세요.";
  }

  const amounts = parseAmountFields(f, allowed, p, {
    actualShown: true,
    defaultPaidOn: date ?? opts.defaultPaidOn,
  });
  if (!amounts.ok) Object.assign(errors, amounts.errors);
  else if (amounts.value.estimate === null && amounts.value.actual === null) {
    errors.estimateAmount = "예상이나 실제 중 하나는 적어 주세요.";
  }

  if (Object.keys(errors).length > 0 || !amounts.ok) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      title,
      date,
      estimate: amounts.value.estimate,
      actual: amounts.value.actual,
    },
  };
}
