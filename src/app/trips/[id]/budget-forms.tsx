"use client";

import {
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  amountInputValue,
  type BudgetSettings,
  CURRENCIES,
  currencyInfo,
  type RateSource,
  rateInputValue,
} from "@/lib/budget";
import {
  type BudgetSettingsFields,
  EMPTY_BUDGET_SETTINGS_FIELDS,
  type ExtraItemFields,
} from "@/lib/budget-input";
import {
  type BudgetSettingsFormState,
  createExtraItemAction,
  deleteExtraItemAction,
  type ExtraItemFormState,
  saveBudgetSettingsAction,
  updateExtraItemAction,
} from "../budget-actions";
import {
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../styles";
import type { PanelExtra } from "./map-types";
import {
  ActualMoneyFields,
  actualDetailValues,
  amountFieldValues,
  type BudgetCurrencies,
  currencyLabel,
  MoneyField,
  rateUnitLabel,
} from "./money-fields";

// 예산 카드의 양식(#14): 예산 설정, 일정 밖 항목 넣기·고치기. 검증은 서버에서 하고 오류와 입력값을 돌려받는다.

const formClass =
  "flex flex-col gap-4 rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145]";

// 액션 결과(state 객체)마다 다른 키. React 19 는 제출할 때마다 form.reset() 을 하므로,
// 칸들을 결과마다 다시 만들어 돌려받은 values 로 맞춘다(schedule-item-form.tsx 와 같은 방법).
const resultKeys = new WeakMap<object, number>();
let lastResultKey = 0;
function resultKey(state: object): number {
  let key = resultKeys.get(state);
  if (key === undefined) {
    key = ++lastResultKey;
    resultKeys.set(state, key);
  }
  return key;
}

// 저장에 성공하면 같은 전환 안에서 닫는다. 저장으로 카드 모양이 바뀌면(예산 없음 → 있음, 항목 날짜 옮기기)
// 양식이 다른 자리에서 새로 그려져 effect 로는 닫히지 않는다(schedule-editor.tsx 의 saveAndClose 와 같은 이유).
function closingOnSave<S extends { savedAt: number | null }>(
  action: (prev: S, formData: FormData) => Promise<S>,
  onClose: () => void,
): (prev: S, formData: FormData) => Promise<S> {
  return async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.savedAt !== prev.savedAt) onClose();
    return next;
  };
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl bg-red-600/10 px-4 py-3 text-sm text-red-600"
    >
      {message}
    </p>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-red-600">
      {message}
    </p>
  );
}

function settingsFields(settings: BudgetSettings | null): BudgetSettingsFields {
  if (!settings) return EMPTY_BUDGET_SETTINGS_FIELDS;
  const unit = settings.localCurrency
    ? (currencyInfo(settings.localCurrency)?.rateUnit ?? 1)
    : 1;
  return {
    totalAmount: amountInputValue(settings.totalAmount, settings.currency),
    currency: settings.currency,
    localCurrency: settings.localCurrency ?? "",
    plannedRate: settings.plannedRate
      ? rateInputValue(settings.plannedRate, unit)
      : "",
  };
}

export function BudgetSettingsForm({
  tripId,
  settings,
  onClose,
}: {
  tripId: string;
  settings: BudgetSettings | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    BudgetSettingsFormState,
    FormData
  >(closingOnSave(saveBudgetSettingsAction.bind(null, tripId), onClose), {
    values: settingsFields(settings),
    errors: {},
    formError: null,
    savedAt: null,
  });
  return (
    <form action={formAction} noValidate className={formClass}>
      <FormError message={state.formError} />
      <SettingsFields key={resultKey(state)} state={state} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "저장하는 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className={secondaryButtonClass}
        >
          취소
        </button>
      </div>
    </form>
  );
}

function SettingsFields({ state }: { state: BudgetSettingsFormState }) {
  const { values, errors } = state;
  const id = useId();
  const [currency, setCurrency] = useState(values.currency);
  const [local, setLocal] = useState(values.localCurrency);
  const totalRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    totalRef.current?.focus();
  }, []);
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-total`} className="text-sm font-medium">
          총 예산
        </label>
        <div className="flex gap-2">
          <input
            ref={totalRef}
            id={`${id}-total`}
            name="totalAmount"
            defaultValue={values.totalAmount}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={errors.totalAmount ? true : undefined}
            aria-describedby={
              errors.totalAmount ? `${id}-total-error` : undefined
            }
            className={`${inputClass} min-w-0 flex-1`}
          />
          <select
            name="currency"
            defaultValue={values.currency}
            aria-label="예산 통화"
            onChange={(e) => setCurrency(e.target.value)}
            className={`${inputClass} w-auto shrink-0`}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {currencyLabel(c.code)}
              </option>
            ))}
          </select>
        </div>
        <FieldError id={`${id}-total-error`} message={errors.totalAmount} />
        <FieldError id={`${id}-currency-error`} message={errors.currency} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-local`} className="text-sm font-medium">
          현지 통화
        </label>
        <select
          id={`${id}-local`}
          name="localCurrency"
          defaultValue={values.localCurrency}
          onChange={(e) => setLocal(e.target.value)}
          aria-invalid={errors.localCurrency ? true : undefined}
          className={inputClass}
        >
          <option value="">없음 (예산 통화로만 적기)</option>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {currencyLabel(c.code)}
            </option>
          ))}
        </select>
        <FieldError id={`${id}-local-error`} message={errors.localCurrency} />
      </div>
      {local !== "" && local !== currency && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-rate`} className="text-sm font-medium">
            예정 환율 {rateUnitLabel(local, currency)}
          </label>
          {/* 현지 통화를 바꾸면 환율 단위가 달라지므로 칸을 비운다(예전 글자가 새 단위로 저장되지 않게). */}
          <input
            key={local}
            id={`${id}-rate`}
            name="plannedRate"
            defaultValue={
              local === values.localCurrency ? values.plannedRate : ""
            }
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={errors.plannedRate ? true : undefined}
            className={inputClass}
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            현지 통화로 적은 예상 비용을 이 환율로 합쳐요. 실제 지출은 결제일
            기준환율로 계산해요.
          </p>
          <FieldError id={`${id}-rate-error`} message={errors.plannedRate} />
        </div>
      )}
    </>
  );
}

export type DateChoice = { value: string; label: string };

function extraFields(
  item: PanelExtra | null,
  currencies: BudgetCurrencies,
  defaultDate: string,
): ExtraItemFields {
  const estimate = amountFieldValues(item?.estimate ?? null, currencies);
  const actual = amountFieldValues(item?.actual ?? null, currencies);
  const detail = actualDetailValues(item?.actual ?? null);
  return {
    title: item?.title ?? "",
    date: item ? (item.date ?? "") : defaultDate,
    estimateAmount: estimate.amount,
    estimateCurrency: estimate.currency,
    actualAmount: actual.amount,
    actualCurrency: actual.currency,
    actualPaidOn: detail.paidOn,
    actualRate: detail.rate,
  };
}

// 일정 밖 항목 넣기(item 없음)·고치기. dates: "여행 전체"("") + 여행 날짜.
export function ExtraItemForm({
  tripId,
  currencies,
  item,
  defaultDate,
  dates,
  onClose,
}: {
  tripId: string;
  currencies: BudgetCurrencies;
  item: PanelExtra | null;
  defaultDate: string;
  dates: DateChoice[];
  onClose: () => void;
}) {
  const action = item
    ? updateExtraItemAction.bind(null, tripId, item.id)
    : createExtraItemAction.bind(null, tripId);
  const [state, formAction, pending] = useActionState<
    ExtraItemFormState,
    FormData
  >(closingOnSave(action, onClose), {
    values: extraFields(item, currencies, defaultDate),
    errors: {},
    formError: null,
    savedAt: null,
  });
  const [deleting, startDelete] = useTransition();

  function onDelete() {
    if (!item || !window.confirm("이 항목을 삭제할까요?")) return;
    startDelete(async () => {
      await deleteExtraItemAction(tripId, item.id);
      onClose();
    });
  }

  const busy = pending || deleting;
  return (
    <form action={formAction} noValidate className={formClass}>
      <FormError message={state.formError} />
      <ExtraFields
        key={resultKey(state)}
        state={state}
        currencies={currencies}
        dates={dates}
        rateSource={item?.actual?.rateSource ?? null}
      />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {pending ? "저장하는 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className={secondaryButtonClass}
        >
          취소
        </button>
        {item && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className={`${dangerButtonClass} ml-auto`}
          >
            {deleting ? "삭제하는 중…" : "삭제"}
          </button>
        )}
      </div>
    </form>
  );
}

function ExtraFields({
  state,
  currencies,
  dates,
  rateSource,
}: {
  state: ExtraItemFormState;
  currencies: BudgetCurrencies;
  dates: DateChoice[];
  rateSource: RateSource | null;
}) {
  const { values, errors } = state;
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-title`} className="text-sm font-medium">
          이름
        </label>
        <input
          ref={titleRef}
          id={`${id}-title`}
          name="title"
          defaultValue={values.title}
          placeholder="예: 항공권 왕복, 편의점"
          autoComplete="off"
          aria-invalid={errors.title ? true : undefined}
          className={inputClass}
        />
        <FieldError id={`${id}-title-error`} message={errors.title} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-date`} className="text-sm font-medium">
          날짜
        </label>
        <select
          id={`${id}-date`}
          name="date"
          defaultValue={values.date}
          aria-invalid={errors.date ? true : undefined}
          className={inputClass}
        >
          {dates.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <FieldError id={`${id}-date-error`} message={errors.date} />
      </div>
      <MoneyField
        id={`${id}-estimate`}
        label="예상"
        amountName="estimateAmount"
        currencyName="estimateCurrency"
        amount={values.estimateAmount}
        currency={values.estimateCurrency}
        currencies={currencies}
        error={errors.estimateAmount ?? errors.estimateCurrency}
      />
      <ActualMoneyFields
        idPrefix={id}
        currencies={currencies}
        amount={values.actualAmount}
        currency={values.actualCurrency}
        paidOn={values.actualPaidOn}
        rate={values.actualRate}
        rateSource={rateSource}
        errors={errors}
      />
    </>
  );
}
