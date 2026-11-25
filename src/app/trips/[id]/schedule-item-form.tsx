"use client";

import {
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  buttonClass,
  cardClass,
  dangerButtonClass,
  errorTextClass,
  fieldAreaClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/app/ui/styles";
import type { RateSource } from "@/lib/budget";
import type { Side } from "@/lib/budget-wallets";
import { existingPlaceIdFor } from "@/lib/schedule";
import type {
  ScheduleFieldErrors,
  ScheduleFields,
  ScheduleFormState,
} from "@/lib/schedule-input";
import { SideSwitch } from "./budget-forms";
import { PrivateBadge } from "./budget-meter";
import { GooglePlaceSearch } from "./google-place-search";
import { CATEGORY_ICONS, type PlaceOption } from "./map-types";
import {
  ActualMoneyFields,
  type BudgetCurrencies,
  defaultCurrency,
  MoneyField,
} from "./money-fields";

// dayNumber: 여행 기간 안 날이면 N일차 번호, 기간 밖 날짜면 null.
export type DateOption = {
  value: string;
  label: string;
  dayNumber: number | null;
};

// "누구" 선택지(#90). value "" = 모두.
export type WhoOption = { value: string; label: string };

type ScheduleItemFormProps = {
  action: (
    prev: ScheduleFormState,
    formData: FormData,
  ) => Promise<ScheduleFormState>;
  initialValues: ScheduleFields;
  // 있으면 날짜 고르기를 보인다(고치기).
  dateOptions?: DateOption[];
  // 이 여행의 장소(숙소 먼저). 있으면 장소 칸에서 고를 수 있다.
  places: PlaceOption[];
  // 장소 칸에 Google 검색을 보일지(브라우저 키가 있고 APIProvider 안일 때, #35).
  searchEnabled: boolean;
  mode: "add" | "edit";
  onClose: () => void;
  // 고치기에서만 "삭제" 버튼.
  onDelete?: () => void;
  deleting?: boolean;
  // 예산 금액 칸(#14). undefined = 보이지 않음, null = 예산 설정 없음(안내 한 줄).
  budget?: BudgetCurrencies | null;
  // 금액 칸을 그릴 쪽(#89, visibleSides). 둘이면 [모임] [내 돈] 전환. 기본은 모임만.
  sides?: Side[];
  // 처음 보일 쪽(방식의 기본 쪽). sides 에 없으면 첫 쪽.
  initialSide?: Side;
  // "누구" 값마다 처음 보일 쪽(#90: 둘 다 여행의 나만 일정은 내 돈). 금액을 아직 건드리지 않았으면 "누구"를 바꿀 때 따른다.
  sideFor?: (forUserId: string) => Side;
  // "누구" 선택지(#90, 첫 값 "" = 모두). 없으면 칸을 그리지 않는다: forUserId 를 보내지 않으므로
  // 추가는 모두로, 고치기는 지금 값 그대로 저장된다.
  whoOptions?: WhoOption[];
  // "누구" 칸 없이 늘 이 값으로 보낸다(떼어 낸 기록 #103: 새 일정·고친 일정은 언제나 나만). whoOptions 와 함께 쓰지 않는다.
  fixedForUserId?: string;
  // 고치기 양식의 실제 지출 칸(완료와 상관없이, #89 §5.6). 쪽마다 처음부터 펼칠지(실제가 있으면)와 환율 출처.
  // undefined = 실제 칸 없음(추가 양식).
  actual?: Record<Side, { open: boolean; rateSource: RateSource | null }>;
};

// 쪽마다의 금액 칸 이름·오류 키. 내 돈 쪽은 같은 칸을 mine* 이름으로 보낸다(schedule-actions).
const SIDE_FIELDS = {
  shared: {
    estimateAmount: "estimateAmount",
    estimateCurrency: "estimateCurrency",
    actualAmount: "actualAmount",
    actualCurrency: "actualCurrency",
    actualPaidOn: "actualPaidOn",
    actualRate: "actualRate",
  },
  mine: {
    estimateAmount: "mineEstimateAmount",
    estimateCurrency: "mineEstimateCurrency",
    actualAmount: "mineActualAmount",
    actualCurrency: "mineActualCurrency",
    actualPaidOn: "mineActualPaidOn",
    actualRate: "mineActualRate",
  },
} as const satisfies Record<
  Side,
  Record<
    | "estimateAmount"
    | "estimateCurrency"
    | "actualAmount"
    | "actualCurrency"
    | "actualPaidOn"
    | "actualRate",
    keyof ScheduleFields
  >
>;

function hasSideErrors(errors: ScheduleFieldErrors, side: Side): boolean {
  return Object.values(SIDE_FIELDS[side]).some(
    (key) => errors[key] !== undefined,
  );
}

// 일정 추가·고치기가 같이 쓰는 양식. 검증은 서버에서 하고, 오류와 입력값을 action 상태로 돌려받는다.
// 추가는 저장할 때마다 key 를 바꿔 빈 양식으로 다시 열고(연달아 적기), 고치기는 저장하면 접는다.
// (고치기를 접는 일은 부르는 쪽 action 이 같은 전환 안에서 한다. 여기서의 onClose 는 그 뒤의 안전장치다.)
// 추가에서 저장은 됐지만 알릴 것(notice, 예: 금액 저장 실패)은 새 양식 위에 보인다.
export function ScheduleItemForm(props: ScheduleItemFormProps) {
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const { mode, onClose } = props;
  return (
    <ScheduleItemFields
      key={version}
      {...props}
      notice={notice}
      onSaved={
        mode === "add"
          ? (next) => {
              setNotice(next);
              setVersion((v) => v + 1);
            }
          : onClose
      }
    />
  );
}

function ScheduleItemFields({
  action,
  initialValues,
  dateOptions,
  places,
  searchEnabled,
  mode,
  onClose,
  onDelete,
  deleting = false,
  budget,
  sides,
  initialSide,
  sideFor,
  whoOptions,
  fixedForUserId,
  actual,
  notice,
  onSaved,
}: ScheduleItemFormProps & {
  notice: string | null;
  onSaved: (notice: string | null) => void;
}) {
  const [state, formAction, pending] = useActionState(action, {
    values: initialValues,
    errors: {},
    formError: null,
    savedAt: null,
  });
  const { values, errors } = state;
  const idPrefix = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  // 열릴 때(추가는 저장 뒤 다시 열릴 때도) 제목 칸에 초점.
  useLayoutEffect(() => {
    titleRef.current?.focus();
  }, []);

  // 저장에 성공하면 savedAt 이 새 값으로 바뀐다.
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  useEffect(() => {
    if (state.savedAt !== null) onSavedRef.current(state.notice ?? null);
  }, [state.savedAt, state.notice]);

  const busy = pending || deleting;

  // 금액 칸의 쪽 상태(#89). 결과마다 다시 그리는 금액 칸(key) 밖에 두어, 검증 오류로 돌아와도 고른 쪽·펼침·
  // 고친 쪽 표시가 남게 한다. 쪽 목록은 양식을 연 때로 고정한다(고치는 사이 칸이 사라지지 않게).
  const [moneySides] = useState<Side[]>(() =>
    sides && sides.length > 0 ? sides : ["shared"],
  );
  const [activeSide, setActiveSide] = useState<Side>(() =>
    initialSide && moneySides.includes(initialSide)
      ? initialSide
      : moneySides[0],
  );
  // 이 양식에서 고친 쪽. hidden "sides" 에는 이 쪽들만 보낸다: 서버는 저장할 때 DB 와 비교하므로
  // 건드리지 않은 쪽의 처음 값을 보내면 그 사이 다른 사람이 고친 금액을 덮을 수 있다.
  const [dirty, setDirty] = useState<Record<Side, boolean>>({
    shared: false,
    mine: false,
  });
  // 실제 칸(금액·통화·결제일·환율)을 고친 쪽. 펼쳤지만 건드리지 않은 쪽은 actualShown 을 보내지 않는다:
  // 서버는 표시가 있으면 빈 실제도 "지움"으로 읽어, 그 사이 다른 사람이 적은 실제를 지울 수 있다.
  const [actualDirty, setActualDirty] = useState<Record<Side, boolean>>({
    shared: false,
    mine: false,
  });
  const [actualOpen, setActualOpen] = useState<Record<Side, boolean>>({
    shared: actual?.shared.open ?? false,
    mine: actual?.mine.open ?? false,
  });
  // 오류가 보이지 않는 쪽에만 있으면 그 쪽으로 넘긴다(결과가 바뀔 때 한 번).
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    const other = moneySides.find((side) => side !== activeSide);
    if (
      other &&
      !hasSideErrors(state.errors, activeSide) &&
      hasSideErrors(state.errors, other)
    ) {
      setActiveSide(other);
    }
  }
  // 쪽 전환을 직접 누르면 "누구"를 바꿔도 쪽을 따라 바꾸지 않는다.
  const sideChosen = useRef(false);
  function onWhoChange(forUserId: string) {
    if (!sideFor || sideChosen.current || dirty.shared || dirty.mine) return;
    const preferred = sideFor(forUserId);
    if (moneySides.includes(preferred)) setActiveSide(preferred);
  }
  const markDirty = (side: Side) =>
    setDirty((current) =>
      current[side] ? current : { ...current, [side]: true },
    );

  return (
    <form
      action={formAction}
      noValidate
      className={`flex flex-col gap-4 ${cardClass}`}
    >
      {notice && (
        <output className="block rounded-[10px] bg-warn-surface px-4 py-3 text-sm text-warn">
          {notice}
        </output>
      )}
      {state.formError && (
        <p
          role="alert"
          className="rounded-[10px] bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {state.formError}
        </p>
      )}
      {dateOptions && (
        <Field idPrefix={idPrefix} label="날짜" name="date" error={errors.date}>
          {(props) => (
            <select
              {...props}
              defaultValue={values.date}
              className={`w-full ${fieldClass}`}
            >
              {dateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {!dateOptions && errors.date && (
        <p role="alert" className={errorTextClass}>
          {errors.date}
        </p>
      )}
      <Field
        idPrefix={idPrefix}
        label="시각 (선택)"
        name="time"
        error={errors.time}
      >
        {(props) => (
          <input
            {...props}
            type="time"
            defaultValue={values.time}
            className={`w-full ${fieldClass}`}
          />
        )}
      </Field>
      <Field
        idPrefix={idPrefix}
        label="제목 (장소가 있으면 선택)"
        name="title"
        error={errors.title}
      >
        {(props) => (
          <input
            {...props}
            ref={titleRef}
            type="text"
            defaultValue={values.title}
            className={`w-full ${fieldClass}`}
          />
        )}
      </Field>
      <PlaceField
        key={resultKey(state)}
        idPrefix={idPrefix}
        places={places}
        searchEnabled={searchEnabled}
        values={values}
        error={errors.place}
      />
      {whoOptions && (
        <WhoField
          key={`who-${resultKey(state)}`}
          idPrefix={idPrefix}
          options={whoOptions}
          value={values.forUserId}
          error={errors.forUserId}
          onChange={onWhoChange}
        />
      )}
      {!whoOptions && fixedForUserId !== undefined && (
        <input type="hidden" name="forUserId" value={fixedForUserId} />
      )}
      {!whoOptions && errors.forUserId && (
        <p role="alert" className={errorTextClass}>
          {errors.forUserId}
        </p>
      )}
      {budget === null && (
        <p className="text-sm text-sub">
          예산을 정하면 예상 비용을 적을 수 있어요(지도 칸 [전체] 탭).
        </p>
      )}
      {/* 고친 쪽만 쓴다(빈 값 = 금액은 쓰지 않음). 금액 칸이 없어도 보내, 칸이 없는 양식이 금액을 건드리지 않게 한다. */}
      <input
        type="hidden"
        name="sides"
        value={budget ? moneySides.filter((side) => dirty[side]).join(",") : ""}
      />
      {budget && (
        <div key={`money-${resultKey(state)}`} className="flex flex-col gap-3">
          {moneySides.length > 1 && (
            <SideSwitch
              name="moneySide"
              sides={moneySides}
              value={activeSide}
              onChange={(side) => {
                sideChosen.current = true;
                setActiveSide(side);
              }}
            />
          )}
          {moneySides.map((side) => (
            <SideMoneyFields
              key={side}
              side={side}
              hidden={side !== activeSide}
              idPrefix={side === "mine" ? `${idPrefix}-mine` : idPrefix}
              budget={budget}
              values={values}
              errors={errors}
              actual={actual?.[side]}
              actualOpen={actualOpen[side]}
              actualDirty={actualDirty[side]}
              onOpenActual={() => {
                // 펼치기만 해서는 고친 것이 아니다(적어야 onChange 로 고친 쪽이 된다). 펼친 채 비워 저장해도
                // 그 쪽을 보내지 않으므로, 그 사이 다른 사람이 적은 실제·예상을 지우거나 되돌리지 않는다.
                setActualOpen((current) => ({ ...current, [side]: true }));
              }}
              onChange={(actualChanged) => {
                markDirty(side);
                if (actualChanged) {
                  setActualDirty((current) =>
                    current[side] ? current : { ...current, [side]: true },
                  );
                }
              }}
            />
          ))}
        </div>
      )}
      <Field
        idPrefix={idPrefix}
        label="메모 (선택)"
        name="memo"
        error={errors.memo}
      >
        {(props) => (
          <textarea
            {...props}
            rows={3}
            defaultValue={values.memo}
            className={`w-full ${fieldAreaClass}`}
          />
        )}
      </Field>
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
          {mode === "add" ? "닫기" : "취소"}
        </button>
        {onDelete && (
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

// 떼어 낸 기록(#103)의 모두 일정 사본에서 내 돈만 적는 양식. 일정 칸(날짜·시각·제목·장소·누구·메모)은 없고
// 모임 금액은 글자로만 보인다(사본은 보기만). 내 돈 예상·실제를 넣고 고치고, 비워 저장하면 지운다.
// ScheduleItemForm 의 내 돈 쪽과 같은 규칙: 고쳤을 때만 sides="mine" 을, 실제 칸을 고쳤을 때만 mineActualShown 을 보낸다.
export function ScheduleMoneyForm({
  action,
  initialValues,
  name,
  sharedLines,
  budget,
  actual,
  onClose,
}: {
  action: (
    prev: ScheduleFormState,
    formData: FormData,
  ) => Promise<ScheduleFormState>;
  initialValues: ScheduleFields;
  // 일정 이름(제목, 없으면 장소).
  name: string;
  // 모임 금액 글자(예 "예상 ₩10,000"). 없으면 빈 배열.
  sharedLines: string[];
  budget: BudgetCurrencies;
  actual: { open: boolean; rateSource: RateSource | null };
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {
    values: initialValues,
    errors: {},
    formError: null,
    savedAt: null,
  });
  const idPrefix = useId();
  const [dirty, setDirty] = useState(false);
  const [actualDirty, setActualDirty] = useState(false);
  const [actualOpen, setActualOpen] = useState(actual.open);

  // 열릴 때 내 돈 예상 칸에 초점.
  useLayoutEffect(() => {
    document.getElementById(`${idPrefix}-mine-estimate`)?.focus();
  }, [idPrefix]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (state.savedAt !== null) onCloseRef.current();
  }, [state.savedAt]);

  return (
    <form
      action={formAction}
      noValidate
      className={`flex flex-col gap-4 ${cardClass}`}
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium break-words">{name}</p>
        <p className="text-sm text-sub">
          함께 쓰던 일정이라 내 돈만 적을 수 있어요.
        </p>
        {sharedLines.length > 0 && (
          <p className="text-sm text-sub">모임 {sharedLines.join(" · ")}</p>
        )}
      </div>
      {state.formError && (
        <p
          role="alert"
          className="rounded-[10px] bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {state.formError}
        </p>
      )}
      <input type="hidden" name="sides" value={dirty ? "mine" : ""} />
      <div key={`money-${resultKey(state)}`} className="flex flex-col gap-3">
        <SideMoneyFields
          side="mine"
          hidden={false}
          idPrefix={`${idPrefix}-mine`}
          budget={budget}
          values={state.values}
          errors={state.errors}
          actual={actual}
          actualOpen={actualOpen}
          actualDirty={actualDirty}
          onOpenActual={() => setActualOpen(true)}
          onChange={(actualChanged) => {
            setDirty(true);
            if (actualChanged) setActualDirty(true);
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
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

// 한 쪽(모임 / 내 돈)의 예상·실제 칸. 보이지 않는 쪽도 hidden 으로 그려 두어 전환해도 적던 값이 남는다.
// 실제 칸은 고치기 양식에만 있고, 실제가 없으면 접힌 "실제 지출 적기"를 누를 때 펼친다(미리 결제, §5.6).
// 펼친 쪽 중 실제 칸을 고친 쪽만 actualShown 표시를 보낸다(서버는 표시가 있는 쪽의 실제만 읽는다).
function SideMoneyFields({
  side,
  hidden,
  idPrefix,
  budget,
  values,
  errors,
  actual,
  actualOpen,
  actualDirty,
  onOpenActual,
  onChange,
}: {
  side: Side;
  hidden: boolean;
  idPrefix: string;
  budget: BudgetCurrencies;
  values: ScheduleFields;
  errors: ScheduleFieldErrors;
  actual: { open: boolean; rateSource: RateSource | null } | undefined;
  actualOpen: boolean;
  actualDirty: boolean;
  onOpenActual: () => void;
  onChange: (actualChanged: boolean) => void;
}) {
  const f = SIDE_FIELDS[side];
  // 펼친 직후에만 실제 금액 칸에 초점을 옮긴다(처음부터 펼친 칸은 그대로).
  const focusActual = useRef(false);
  return (
    // 칸의 change 가 여기까지 올라오면 이 쪽을 고친 것으로 본다.
    // 실제 칸이 바뀐 것인지는 칸 이름으로 가린다(예상 칸만 고치면 실제는 건드리지 않은 것).
    <div
      hidden={hidden}
      onChange={(event) => {
        const name = (event.target as HTMLInputElement).name;
        onChange(
          name === f.actualAmount ||
            name === f.actualCurrency ||
            name === f.actualPaidOn ||
            name === f.actualRate,
        );
      }}
      className="flex flex-col gap-3"
    >
      {side === "mine" && <PrivateBadge />}
      <MoneyField
        id={`${idPrefix}-estimate`}
        label="예상 비용 (선택)"
        amountName={f.estimateAmount}
        currencyName={f.estimateCurrency}
        amount={values[f.estimateAmount]}
        currency={values[f.estimateCurrency] || defaultCurrency(budget)}
        currencies={budget}
        error={errors[f.estimateAmount] ?? errors[f.estimateCurrency]}
      />
      {actual &&
        (actualOpen ? (
          <>
            {actualDirty && (
              <input
                type="hidden"
                name={side === "mine" ? "mineActualShown" : "actualShown"}
                value="1"
              />
            )}
            <ActualMoneyFields
              idPrefix={idPrefix}
              currencies={budget}
              amount={values[f.actualAmount]}
              currency={values[f.actualCurrency] || defaultCurrency(budget)}
              paidOn={values[f.actualPaidOn]}
              rate={values[f.actualRate]}
              rateSource={actual.rateSource}
              errors={{
                actualAmount: errors[f.actualAmount],
                actualCurrency: errors[f.actualCurrency],
                actualPaidOn: errors[f.actualPaidOn],
                actualRate: errors[f.actualRate],
              }}
              namePrefix={side === "mine" ? "mine" : ""}
              inputRef={(el) => {
                if (el && focusActual.current) {
                  focusActual.current = false;
                  el.focus();
                }
              }}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              focusActual.current = true;
              onOpenActual();
            }}
            className={`${buttonClass("secondary", "small")} self-start`}
          >
            + 실제 지출 적기
          </button>
        ))}
    </div>
  );
}

// "누구" 칸(#90 §5.6): 라디오 모양 단추 줄, 많으면 줄바꿈. 제어하지 않는다(defaultChecked):
// React 19 는 제출마다 form.reset() 을 하므로 결과마다 key 로 다시 만들어 돌려받은 값으로 맞춘다(장소 칸과 같은 방식).
function WhoField({
  idPrefix,
  options,
  value,
  error,
  onChange,
}: {
  idPrefix: string;
  options: WhoOption[];
  value: string;
  error: string | undefined;
  onChange: (forUserId: string) => void;
}) {
  const errorId = `${idPrefix}-forUserId-error`;
  // 값이 보기에 없으면(나간 사람 등) 맨 앞 "모두"를 골라 보이고 보낸다.
  const checkedValue = options.some((option) => option.value === value)
    ? value
    : (options[0]?.value ?? "");
  return (
    <fieldset
      className="flex flex-col gap-1.5"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-1.5 text-sm font-medium">누구</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            className="inline-flex h-8 cursor-pointer items-center rounded-full border border-field-line bg-field px-3 text-[13px] font-semibold text-sub transition-colors has-checked:border-foreground has-checked:bg-foreground has-checked:text-on-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-foreground"
          >
            <input
              type="radio"
              name="forUserId"
              value={option.value}
              defaultChecked={option.value === checkedValue}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className={errorTextClass}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

// 액션 결과(state 객체)마다 다른 키. React 19 는 제출할 때마다(검증 오류로 돌아와도) form.reset() 을 하므로,
// 장소 칸을 결과마다 다시 만들어 select·글자 칸·보이기 상태를 돌려받은 values 로 함께 맞춘다.
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

// 장소 칸(§5.4, #35): Google 검색(브라우저 키가 있을 때) + 이 여행의 장소 중 고르기(장소가 있을 때, 맨 위 "직접 적기")
// + 직접 적기일 때만 보이는 글자 칸. Google 후보를 고르면 고르기·글자 칸 대신 고른 장소를 보이고 숨은 값으로 보낸다.
// 고른 Google 장소가 이미 이 여행의 장소면 placeId 로 보낸다(서버도 같은 경우를 다시 확인한다).
// 저장할 때만 '가 볼 곳'에 들어간다. 고르기만 하고 닫으면 아무것도 생기지 않는다.
// 장소를 고르면 서버가 그 장소의 이름표를 place 글자로 저장하므로 글자 칸은 보내지 않는다.
// select 는 제어하지 않는다(defaultValue). 제어하면 form.reset() 뒤 화면은 "직접 적기"로 돌아가는데
// React 상태는 고른 장소로 남아 글자 칸이 숨은 채 placeId="" 가 제출된다. onChange 는 글자 칸 보이기만 바꾼다.
type PickedPlace = { googlePlaceId: string; label: string; category: string };

function PlaceField({
  idPrefix,
  places,
  searchEnabled,
  values,
  error,
}: {
  idPrefix: string;
  places: PlaceOption[];
  searchEnabled: boolean;
  values: ScheduleFields;
  error: string | undefined;
}) {
  // 검증 오류로 돌아오면 고른 Google 장소를 그대로 보인다.
  const [picked, setPicked] = useState<PickedPlace | null>(
    values.googlePlaceId
      ? {
          googlePlaceId: values.googlePlaceId,
          label: values.googleLabel,
          category: values.googleCategory,
        }
      : null,
  );
  const [searchError, setSearchError] = useState<string | null>(null);
  // 이어졌던 장소가 그 사이 지워졌으면 직접 적기로 연다(글자는 그대로 남아 있다).
  const initialPlaceId = places.some((place) => place.id === values.placeId)
    ? values.placeId
    : "";
  const [chosenId, setChosenId] = useState(initialPlaceId);
  // 직접 적은 글자. Google 장소를 고른 동안 글자 칸이 빠졌다가 ✕ 로 다시 생겨도 적던 글자가 남게 한다.
  const [typedPlace, setTypedPlace] = useState(values.place);
  // 고른 장소가 다시 그린 목록에서 사라지면(다른 곳에서 지움) 브라우저 select 는 "직접 적기"로 돌아간다.
  // 보이기도 목록에 있는지로 정해, 화면·글자 칸·제출 값이 같은 "직접 적기"가 되게 한다(글자 칸은 일정의 장소 글자로 채움).
  const placeId = places.some((place) => place.id === chosenId) ? chosenId : "";
  const hasSelect = places.length > 0;
  const selectId = `${idPrefix}-placeId`;
  const textId = `${idPrefix}-place`;
  const errorId = `${idPrefix}-place-error`;
  const shownError = error ?? searchError;
  const existingId = picked
    ? existingPlaceIdFor(picked.googlePlaceId, places)
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      {picked || searchEnabled ? (
        <span className="text-sm font-medium">장소 (선택)</span>
      ) : (
        <label
          htmlFor={hasSelect ? selectId : textId}
          className="text-sm font-medium"
        >
          장소 (선택)
        </label>
      )}
      {picked ? (
        <div className="flex items-center gap-2 rounded-[10px] border border-field-line bg-field px-3 py-2">
          <p className="min-w-0 flex-1 break-words">
            📍 {picked.label}{" "}
            <span className="text-sm text-sub">
              · {existingId ? "가 볼 곳에 있는 장소" : "가 볼 곳에 새로 넣어요"}
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              setPicked(null);
              setSearchError(null);
            }}
            aria-label="고른 장소 지우기"
            aria-describedby={shownError ? errorId : undefined}
            className="shrink-0 rounded-[8px] px-2 py-1 text-sub hover:bg-background hover:text-foreground"
          >
            ✕
          </button>
          {existingId ? (
            <input type="hidden" name="placeId" value={existingId} />
          ) : (
            <>
              {/* 서버는 Google 장소가 있으면 placeId 를 쓰지 않는다. 오류로 돌아와 고른 장소를 지우면
                  고르기 목록이 Google 장소를 고르기 전 선택으로 돌아가도록 함께 보낸다. */}
              <input type="hidden" name="placeId" value={placeId} />
              <input type="hidden" name="place" value={typedPlace} />
              <input
                type="hidden"
                name="googlePlaceId"
                value={picked.googlePlaceId}
              />
              <input type="hidden" name="googleLabel" value={picked.label} />
              <input
                type="hidden"
                name="googleCategory"
                value={picked.category}
              />
            </>
          )}
        </div>
      ) : (
        <>
          {searchEnabled && (
            <GooglePlaceSearch
              ariaLabel="장소 검색 (Google)"
              onPick={(pick) => {
                setSearchError(null);
                setPicked(pick);
              }}
              onError={setSearchError}
            />
          )}
          {hasSelect && (
            <select
              id={selectId}
              name="placeId"
              // Google 장소를 고른 동안 select 는 빠졌다가 ✕ 로 다시 생긴다. 그때 화면 값이 chosenId(글자 칸 보이기)와
              // 같도록 처음 값이 아니라 지금 선택으로 연다.
              defaultValue={placeId}
              onChange={(event) => setChosenId(event.target.value)}
              aria-label={
                searchEnabled ? "이 여행의 장소에서 고르기" : undefined
              }
              aria-invalid={Boolean(shownError) && placeId !== ""}
              aria-describedby={
                shownError && placeId !== "" ? errorId : undefined
              }
              className={`w-full ${fieldClass}`}
            >
              <option value="">직접 적기</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {CATEGORY_ICONS[place.category]} {place.label}
                </option>
              ))}
            </select>
          )}
          {placeId === "" && (
            <input
              id={textId}
              name="place"
              type="text"
              defaultValue={typedPlace}
              onChange={(event) => setTypedPlace(event.target.value)}
              aria-label={
                hasSelect || searchEnabled ? "장소 직접 적기" : undefined
              }
              placeholder={hasSelect || searchEnabled ? "장소 이름" : undefined}
              aria-invalid={Boolean(shownError)}
              aria-describedby={shownError ? errorId : undefined}
              className={`w-full ${fieldClass}`}
            />
          )}
        </>
      )}
      {shownError && (
        <p id={errorId} role="alert" className={errorTextClass}>
          {shownError}
        </p>
      )}
    </div>
  );
}

type ControlProps = {
  id: string;
  name: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
};

function Field({
  idPrefix,
  label,
  name,
  error,
  children,
}: {
  idPrefix: string;
  label: string;
  name: keyof ScheduleFields;
  error: string | undefined;
  children: (props: ControlProps) => React.ReactNode;
}) {
  const id = `${idPrefix}-${name}`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        name,
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} role="alert" className={errorTextClass}>
          {error}
        </p>
      )}
    </div>
  );
}
