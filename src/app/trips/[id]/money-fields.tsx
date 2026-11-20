"use client";

import { useState } from "react";
import {
  type ActualMoney,
  amountInputValue,
  currencyInfo,
  type Money,
  type RateSource,
  rateInputValue,
} from "@/lib/budget";
import { inputBaseClass, inputClass } from "../styles";

// 예산 카드와 일정 양식이 같이 쓰는 금액 칸(#14). 통화는 그 여행의 예산·현지 통화 둘 중 하나만 고른다.

export type BudgetCurrencies = {
  currency: string;
  localCurrency: string | null;
};

export const RATE_SOURCE_LABELS: Record<RateSource, string> = {
  ecb: "기준환율",
  manual: "직접 넣은 환율",
  planned: "예정 환율",
};

// 새 금액의 기본 통화: 현지 통화가 있으면 현지 통화.
export function defaultCurrency(c: BudgetCurrencies): string {
  return c.localCurrency ?? c.currency;
}

export function currencyLabel(code: string): string {
  const info = currencyInfo(code);
  return info ? `${info.symbol.trim()} ${info.label}` : code;
}

// 양식 기본값(글자). 금액이 없으면 빈칸, 통화는 그 금액의 통화 또는 기본 통화.
export function amountFieldValues(
  money: Money | null,
  c: BudgetCurrencies,
): { amount: string; currency: string } {
  return money
    ? {
        amount: amountInputValue(money.amount, money.currency),
        currency: money.currency,
      }
    : { amount: "", currency: defaultCurrency(c) };
}

export function actualDetailValues(actual: ActualMoney | null): {
  paidOn: string;
  rate: string;
} {
  if (!actual || actual.rate === null) return { paidOn: "", rate: "" };
  const unit = currencyInfo(actual.currency)?.rateUnit ?? 1;
  return {
    paidOn: actual.paidOn ?? "",
    rate: rateInputValue(actual.rate, unit),
  };
}

// "¥100 = ₩" 처럼 환율 칸 앞에 붙는 글자.
export function rateUnitLabel(local: string, budget: string): string {
  const l = currencyInfo(local);
  const b = currencyInfo(budget);
  return `${l?.symbol.trim() ?? local}${l?.rateUnit ?? 1} = ${b?.symbol.trim() ?? budget}`;
}

// 금액 + 통화 고르기. 현지 통화가 없으면 고르기 대신 숨은 값(예산 통화).
export function MoneyField({
  id,
  label,
  amountName,
  currencyName,
  amount,
  currency,
  currencies,
  error,
  onCurrencyChange,
  inputRef,
}: {
  id: string;
  label: string;
  amountName: string;
  currencyName: string;
  amount: string;
  currency: string;
  currencies: BudgetCurrencies;
  error?: string;
  onCurrencyChange?: (code: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const errorId = `${id}-error`;
  const choices = currencies.localCurrency
    ? [currencies.localCurrency, currencies.currency]
    : null;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={id}
          name={amountName}
          defaultValue={amount}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${inputBaseClass} min-w-0 flex-1`}
        />
        {choices ? (
          <select
            name={currencyName}
            defaultValue={currency}
            aria-label={`${label} 통화`}
            onChange={(e) => onCurrencyChange?.(e.target.value)}
            className={`${inputBaseClass} w-auto shrink-0`}
          >
            {choices.map((code) => (
              <option key={code} value={code}>
                {currencyLabel(code)}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="hidden"
            name={currencyName}
            value={currencies.currency}
          />
        )}
      </div>
      {error && (
        <p id={errorId} className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// 실제 지출이 현지 통화일 때만 보이는 결제일·환율 칸(설계 §5.7.2). 환율 빈칸 = 결제일 기준환율로 자동.
export function ActualRateFields({
  idPrefix,
  localCurrency,
  budgetCurrency,
  paidOn,
  rate,
  rateSource,
  errors,
}: {
  idPrefix: string;
  localCurrency: string;
  budgetCurrency: string;
  paidOn: string;
  rate: string;
  rateSource: RateSource | null;
  errors: { actualPaidOn?: string; actualRate?: string };
}) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${idPrefix}-paid-on`}
          className="text-zinc-600 dark:text-zinc-400"
        >
          결제일
        </label>
        <input
          id={`${idPrefix}-paid-on`}
          type="date"
          name="actualPaidOn"
          defaultValue={paidOn}
          aria-invalid={errors.actualPaidOn ? true : undefined}
          className={`${inputBaseClass} w-auto py-1.5`}
        />
        {errors.actualPaidOn && (
          <p className="text-red-600">{errors.actualPaidOn}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${idPrefix}-rate`}
          className="text-zinc-600 dark:text-zinc-400"
        >
          환율 {rateUnitLabel(localCurrency, budgetCurrency)}
          {rateSource && rate !== "" && ` (${RATE_SOURCE_LABELS[rateSource]})`}
        </label>
        <input
          id={`${idPrefix}-rate`}
          name="actualRate"
          defaultValue={rate}
          inputMode="decimal"
          autoComplete="off"
          placeholder="결제일 기준환율로 자동"
          aria-invalid={errors.actualRate ? true : undefined}
          className={`${inputBaseClass} w-48 py-1.5`}
        />
        {errors.actualRate && (
          <p className="text-red-600">{errors.actualRate}</p>
        )}
      </div>
    </div>
  );
}

// 실제 지출 금액 + (현지 통화면) 결제일·환율. 통화를 바꾸면 결제일·환율 칸을 보이거나 숨긴다.
export function ActualMoneyFields({
  idPrefix,
  currencies,
  amount,
  currency,
  paidOn,
  rate,
  rateSource,
  errors,
}: {
  idPrefix: string;
  currencies: BudgetCurrencies;
  amount: string;
  currency: string;
  paidOn: string;
  rate: string;
  rateSource: RateSource | null;
  errors: {
    actualAmount?: string;
    actualCurrency?: string;
    actualPaidOn?: string;
    actualRate?: string;
  };
}) {
  const [chosen, setChosen] = useState(currency);
  const local = currencies.localCurrency;
  return (
    <div className="flex flex-col gap-2">
      <MoneyField
        id={`${idPrefix}-actual`}
        label="실제 지출"
        amountName="actualAmount"
        currencyName="actualCurrency"
        amount={amount}
        currency={currency}
        currencies={currencies}
        error={errors.actualAmount ?? errors.actualCurrency}
        onCurrencyChange={setChosen}
      />
      {local !== null && chosen === local && (
        <ActualRateFields
          idPrefix={idPrefix}
          localCurrency={local}
          budgetCurrency={currencies.currency}
          paidOn={paidOn}
          rate={rate}
          rateSource={rateSource}
          errors={errors}
        />
      )}
    </div>
  );
}
