"use client";

import {
  useActionState,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  dangerButtonClass,
  errorTextClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/app/ui/styles";
import {
  amountInputValue,
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
import { type BudgetMode, isBudgetMode, type Side } from "@/lib/budget-wallets";
import {
  type BudgetSettingsFormState,
  createExtraItemAction,
  deleteExtraItemAction,
  type ExtraItemFormState,
  saveBudgetSettingsAction,
  updateExtraItemAction,
} from "../budget-actions";
import { LockIcon, PrivateBadge } from "./budget-meter";
import type { PanelBudget, PanelExtra } from "./map-types";
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

// 예산 카드(surface) 안에 열리므로 바탕색(background)으로 구분한다(#53 §5.5).
const formClass = "flex flex-col gap-4 rounded-[14px] bg-background p-4";

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
      className="rounded-[10px] bg-danger/10 px-4 py-3 text-sm text-danger"
    >
      {message}
    </p>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className={errorTextClass}>
      {message}
    </p>
  );
}

export const MODE_LABELS: Record<BudgetMode, string> = {
  shared: "모임 통장",
  personal: "각자",
  both: "둘 다",
};

const MODE_HINTS: Record<BudgetMode, string> = {
  shared: "예산과 지출을 모두 함께 봐요.",
  personal: "예산과 지출을 사람마다 따로 적어요. 내 것은 나만 봐요.",
  both: "모임 예산과 내 예산을 함께 써요. 지출마다 누구 돈인지 골라요.",
};

export const SIDE_LABELS: Record<Side, string> = {
  shared: "모임",
  mine: "내 돈",
};

export type BudgetConfig = NonNullable<PanelBudget>["config"];

function settingsFields(config: BudgetConfig | null): BudgetSettingsFields {
  if (!config) return EMPTY_BUDGET_SETTINGS_FIELDS;
  const unit = config.localCurrency
    ? (currencyInfo(config.localCurrency)?.rateUnit ?? 1)
    : 1;
  return {
    mode: config.mode,
    totalAmount:
      config.sharedTotal === null
        ? ""
        : amountInputValue(config.sharedTotal, config.currency),
    // 통화가 바뀐 내 예산은 myTotal 이 null 이라 빈칸(옛 숫자를 새 통화로 채우지 않는다, 설계 §5.5).
    myTotal:
      config.myTotal === null
        ? ""
        : amountInputValue(config.myTotal, config.currency),
    currency: config.currency,
    localCurrency: config.localCurrency ?? "",
    plannedRate: config.plannedRate
      ? rateInputValue(config.plannedRate, unit)
      : "",
  };
}

// 예산 설정(#14) + 방식·내 예산(#89). config 가 null 이면 예산을 처음 정한다(방식은 모임 통장부터).
// sharedLeftover: 각자 방식인데 모임 행이 남아 모임 카드가 보인다 → 모임 총 예산 칸도 보인다.
// focus: 처음 초점을 둘 칸("내 예산 정하기"로 열었으면 내 예산).
export function BudgetSettingsForm({
  tripId,
  config,
  isOwner,
  sharedLeftover = false,
  focus = "total",
  onClose,
}: {
  tripId: string;
  config: BudgetConfig | null;
  isOwner: boolean;
  sharedLeftover?: boolean;
  focus?: "total" | "mine";
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    BudgetSettingsFormState,
    FormData
  >(closingOnSave(saveBudgetSettingsAction.bind(null, tripId), onClose), {
    values: settingsFields(config),
    errors: {},
    formError: null,
    savedAt: null,
  });
  return (
    <form action={formAction} noValidate className={formClass}>
      <FormError message={state.formError} />
      <SettingsFields
        key={resultKey(state)}
        state={state}
        currentMode={config?.mode ?? "shared"}
        isOwner={isOwner}
        sharedLeftover={sharedLeftover}
        focus={focus}
      />
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

function SettingsFields({
  state,
  currentMode,
  isOwner,
  sharedLeftover,
  focus,
}: {
  state: BudgetSettingsFormState;
  currentMode: BudgetMode;
  isOwner: boolean;
  sharedLeftover: boolean;
  focus: "total" | "mine";
}) {
  const { values, errors } = state;
  const id = useId();
  // 방식은 주인만 고른다. 주인이 아니면 mode 를 보내지 않고(서버가 무시) 지금 방식대로 칸을 보인다.
  const [mode, setMode] = useState<BudgetMode>(
    isOwner && isBudgetMode(values.mode) ? values.mode : currentMode,
  );
  const [currency, setCurrency] = useState(values.currency);
  const [local, setLocal] = useState(values.localCurrency);
  const totalRef = useRef<HTMLInputElement>(null);
  const mineRef = useRef<HTMLInputElement>(null);
  // 모임 총 예산: 각자 방식이면 숨긴다. 숨겨도 칸은 그대로 보낸다(값을 지우지 않게. 서버는 각자 방식에서
  // 빈칸을 허용하고 적힌 값은 그대로 저장한다 — 주인 아닌 사람이 내 예산만 저장해도 모임 총액이 남는다).
  const showTotal =
    mode !== "personal" || sharedLeftover || !!errors.totalAmount;
  // 내 예산: 모임 통장이 아닐 때만 칸을 그린다(서버는 칸이 있을 때만 내 예산을 건드린다).
  const showMine = mode !== "shared";
  // biome-ignore lint/correctness/useExhaustiveDependencies: 처음 그릴 때 한 번만 초점을 둔다
  useLayoutEffect(() => {
    (focus === "mine" && showMine
      ? mineRef.current
      : (totalRef.current ?? mineRef.current)
    )?.focus();
  }, []);
  // 예산 통화: 모임 통장이면 지금처럼 총 예산 칸 옆. 내 돈을 쓰는 방식이면 따로 한 줄("함께 써요")로 두어
  // "나만 보여요" 내 예산 칸 아래에 놓이지 않게 하고, 금액 칸 옆에는 통화 이름만 보인다.
  const shared = mode === "shared";
  const currencySelect = (
    <select
      id={`${id}-currency`}
      name="currency"
      value={currency}
      aria-label={shared ? "예산 통화" : undefined}
      onChange={(e) => setCurrency(e.target.value)}
      className={`${fieldClass} ${shared ? "w-auto shrink-0" : "w-full"}`}
    >
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {currencyLabel(c.code)}
        </option>
      ))}
    </select>
  );
  const currencyName = (
    <span className="shrink-0 text-sm text-sub">{currencyLabel(currency)}</span>
  );
  // 숨긴 모임 총액은 처음 통화로 적힌 글자다. 통화를 바꿨으면 새 통화로 다시 읽히지 않게 빈칸(각자 방식은 빈칸 허용 → 없음).
  const hiddenTotal = currency === values.currency ? values.totalAmount : "";
  return (
    <>
      <div className="flex flex-col gap-1">
        {isOwner ? (
          <>
            <label htmlFor={`${id}-mode`} className="text-sm font-medium">
              방식
            </label>
            <select
              id={`${id}-mode`}
              name="mode"
              value={mode}
              onChange={(e) => {
                if (isBudgetMode(e.target.value)) setMode(e.target.value);
              }}
              aria-invalid={errors.mode ? true : undefined}
              aria-describedby={
                errors.mode
                  ? `${id}-mode-hint ${id}-mode-error`
                  : `${id}-mode-hint`
              }
              className={`w-full ${fieldClass}`}
            >
              {(Object.keys(MODE_LABELS) as BudgetMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
            <p id={`${id}-mode-hint`} className="text-sm text-sub">
              {MODE_HINTS[mode]}
            </p>
            <FieldError id={`${id}-mode-error`} message={errors.mode} />
          </>
        ) : (
          <p className="text-sm text-sub">
            방식: {MODE_LABELS[currentMode]} · 여행 주인이 정해요
          </p>
        )}
      </div>
      {!shared && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-currency`} className="text-sm font-medium">
            예산 통화 <span className="font-normal text-sub">(함께 써요)</span>
          </label>
          {currencySelect}
          <FieldError id={`${id}-currency-error`} message={errors.currency} />
        </div>
      )}
      {showTotal ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-total`} className="text-sm font-medium">
            {mode === "shared" ? "총 예산" : "모임 총 예산"}
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
              className={`${fieldClass} min-w-0 flex-1`}
            />
            {shared ? currencySelect : currencyName}
          </div>
          <FieldError id={`${id}-total-error`} message={errors.totalAmount} />
          {shared && (
            <FieldError id={`${id}-currency-error`} message={errors.currency} />
          )}
        </div>
      ) : (
        <input type="hidden" name="totalAmount" value={hiddenTotal} />
      )}
      {showMine && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <label htmlFor={`${id}-mine`} className="text-sm font-medium">
              내 예산
            </label>
            <PrivateBadge />
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={mineRef}
              id={`${id}-mine`}
              name="myTotal"
              defaultValue={values.myTotal}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.myTotal ? true : undefined}
              aria-describedby={errors.myTotal ? `${id}-mine-error` : undefined}
              className={`${fieldClass} min-w-0 flex-1`}
            />
            {currencyName}
          </div>
          <FieldError id={`${id}-mine-error`} message={errors.myTotal} />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-local`} className="text-sm font-medium">
          현지 통화
          {!shared && (
            <>
              {" "}
              <span className="font-normal text-sub">(함께 써요)</span>
            </>
          )}
        </label>
        <select
          id={`${id}-local`}
          name="localCurrency"
          defaultValue={values.localCurrency}
          onChange={(e) => setLocal(e.target.value)}
          aria-invalid={errors.localCurrency ? true : undefined}
          className={`w-full ${fieldClass}`}
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
            className={`w-full ${fieldClass}`}
          />
          <p className="text-sm text-sub">
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

// 일정 밖 지출의 날짜 고르기: "여행 전체" + 여행의 날들. 예산 카드와 아래 예산 줄 시트가 같이 쓴다.
export function tripDateChoices(
  days: { date: string; label: string }[],
): DateChoice[] {
  return [
    { value: "", label: "여행 전체" },
    ...days.map((d) => ({ value: d.date, label: d.label })),
  ];
}

function extraFields(
  item: PanelExtra | null,
  currencies: BudgetCurrencies,
  defaultDate: string,
  side: Side,
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
    side,
  };
}

// 일정 밖 항목 넣기(item 없음)·고치기. dates: "여행 전체"("") + 여행 날짜.
// sides: 누구 돈(#89). 하나면 hidden 으로 보내고(카드의 쪽), 둘이면 [모임] [내 돈] 고르기(처음은 sides[0]).
// 고치기는 서버가 저장된 행의 쪽을 쓰므로 보내도 상관없다.
export function ExtraItemForm({
  tripId,
  currencies,
  item,
  defaultDate,
  dates,
  sides,
  onClose,
}: {
  tripId: string;
  currencies: BudgetCurrencies;
  item: PanelExtra | null;
  defaultDate: string;
  dates: DateChoice[];
  sides: Side[];
  onClose: () => void;
}) {
  const action = item
    ? updateExtraItemAction.bind(null, tripId, item.id)
    : createExtraItemAction.bind(null, tripId);
  const [state, formAction, pending] = useActionState<
    ExtraItemFormState,
    FormData
  >(closingOnSave(action, onClose), {
    values: extraFields(item, currencies, defaultDate, sides[0]),
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
        sides={sides}
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
  sides,
  rateSource,
}: {
  state: ExtraItemFormState;
  currencies: BudgetCurrencies;
  dates: DateChoice[];
  sides: Side[];
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
          className={`w-full ${fieldClass}`}
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
          className={`w-full ${fieldClass}`}
        >
          {dates.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <FieldError id={`${id}-date-error`} message={errors.date} />
      </div>
      {sides.length > 1 ? (
        <SideSwitch
          name="side"
          sides={sides}
          defaultValue={sides.find((side) => side === values.side) ?? sides[0]}
          error={errors.side}
        />
      ) : (
        <>
          <input type="hidden" name="side" value={sides[0]} />
          {/* 고를 칸이 없어 이어 줄 곳이 없으므로 바로 읽히게 alert 로 둔다(낡은 양식 등 드문 경우). */}
          {errors.side && (
            <p role="alert" className={errorTextClass}>
              {errors.side}
            </p>
          )}
        </>
      )}
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

// 누구 돈 고르기 [모임] [내 돈](#89). 라디오 그룹이라 화살표 키로 움직인다.
export function SideSwitch({
  name,
  sides,
  defaultValue,
  error,
}: {
  name: string;
  sides: Side[];
  defaultValue: Side;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset
      className="flex flex-col gap-1"
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="mb-1 text-sm font-medium">누구 돈</legend>
      <div className="inline-flex self-start rounded-[10px] border border-field-line bg-field p-0.5">
        {sides.map((side) => (
          <label
            key={side}
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-[8px] px-3 text-[13px] font-semibold text-sub transition-colors has-checked:bg-foreground has-checked:text-on-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-foreground"
          >
            <input
              type="radio"
              name={name}
              value={side}
              defaultChecked={side === defaultValue}
              className="sr-only"
            />
            {SIDE_LABELS[side]}
            {side === "mine" && <LockIcon />}
          </label>
        ))}
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </fieldset>
  );
}
