"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { APIProvider } from "@vis.gl/react-google-maps";
import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { type ActualMoney, formatMoney, type Money } from "@/lib/budget";
import { placeUrl } from "@/lib/leg-display";
import { mapsSearchUrl } from "@/lib/schedule";
import {
  EMPTY_SCHEDULE_FIELDS,
  type ScheduleFormState,
} from "@/lib/schedule-input";
import {
  setScheduleItemActualAction,
  undoScheduleItemWithActualAction,
} from "../budget-actions";
import { SAVE_FAILED } from "../messages";
import {
  createScheduleItemAction,
  deleteScheduleItemAction,
  setScheduleItemDoneAction,
  updateScheduleItemAction,
} from "../schedule-actions";
import { inputClass } from "../styles";
import type { PlaceOption } from "./map-types";
import {
  actualDetailValues,
  amountFieldValues,
  type BudgetCurrencies,
  currencyLabel,
} from "./money-fields";
import { type DateOption, ScheduleItemForm } from "./schedule-item-form";

export type { DateOption };

// time 은 화면용 "HH:MM"(없으면 "").
export type RowItem = {
  id: string;
  date: string;
  time: string;
  // 장소가 있으면 null 일 수 있다. 그때는 place 글자를 제목 자리에 보인다.
  title: string | null;
  place: string | null;
  placeId: string | null;
  memo: string | null;
  done: boolean;
  // 예산 금액(#14). 일정 줄에는 보이지 않고 양식·체크칸에서만 쓴다.
  estimate: Money | null;
  actual: ActualMoney | null;
};

const ERROR_VISIBLE_MS = 4000;

// 입력칸은 화면 전체에서 하나만 열린다. 키: "add:<날짜>" 또는 "edit:<일정 id>".
// places: 이 여행의 장소(숙소 먼저). 양식의 장소 고르기와 이어진 장소의 링크에 쓴다.
// searchEnabled: 장소 칸에서 Google 검색을 보일지(브라우저 키가 있을 때, #35).
// budget: 예산 설정의 두 통화(#14). 없으면 null(금액 칸 대신 안내).
type OpenState = {
  openKey: string | null;
  setOpenKey: React.Dispatch<React.SetStateAction<string | null>>;
  places: PlaceOption[];
  searchEnabled: boolean;
  budget: BudgetCurrencies | null;
};

const OpenContext = createContext<OpenState | null>(null);

function useOpen(): OpenState {
  const value = use(OpenContext);
  if (!value) throw new Error("ScheduleEditorProvider 안에서만 쓸 수 있어요.");
  return value;
}

// Next 는 지나온 화면을 숨겨 보관(Activity)하므로, 화면을 떠날 때 열린 입력칸을 닫는다.
// (그대로 두면 다음 방문에 쓰다 만 입력칸이나 지난 오류 문구가 남는다.)
// 브라우저 키가 있으면 일정 칸도 APIProvider 로 감싼다. 지도 칸과 같은 설정이어야 한다
// (Maps 스크립트는 페이지에 한 번만 불러오고, 다른 설정으로 다시 부르면 무시된다).
export function ScheduleEditorProvider({
  places,
  browserKey,
  budget,
  children,
}: {
  places: PlaceOption[];
  browserKey: string | null;
  budget: BudgetCurrencies | null;
  children: React.ReactNode;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  useLayoutEffect(() => () => setOpenKey(null), []);
  const body = (
    <OpenContext
      value={{
        openKey,
        setOpenKey,
        places,
        searchEnabled: browserKey !== null,
        budget,
      }}
    >
      {children}
    </OpenContext>
  );
  if (!browserKey) return body;
  return (
    <APIProvider apiKey={browserKey} language="ko">
      {body}
    </APIProvider>
  );
}

export function AddScheduleItem({
  tripId,
  date,
}: {
  tripId: string;
  date: string;
}) {
  const { openKey, setOpenKey, places, searchEnabled, budget } = useOpen();
  const key = `add:${date}`;

  if (openKey !== key) {
    return (
      <button
        type="button"
        onClick={() => setOpenKey(key)}
        className="self-start rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
      >
        + 일정 추가
      </button>
    );
  }
  return (
    <ScheduleItemForm
      mode="add"
      action={createScheduleItemAction.bind(null, tripId, date)}
      initialValues={{ ...EMPTY_SCHEDULE_FIELDS, date }}
      places={places}
      searchEnabled={searchEnabled}
      budget={budget}
      onClose={() => setOpenKey(null)}
    />
  );
}

// sortable: 손잡이로 끌 수 있는가(그날 일정이 둘 이상, #41). SortableContext 안에서만 쓴다.
export function ScheduleItemRow({
  tripId,
  item,
  dateOptions,
  sortable,
}: {
  tripId: string;
  item: RowItem;
  dateOptions: DateOption[];
  sortable: boolean;
}) {
  const { openKey, setOpenKey, places, searchEnabled, budget } = useOpen();
  const key = `edit:${item.id}`;
  const editing = openKey === key;
  // 완료 체크칸을 켜면 열리는 실제 지출 칸(#14 §5.7.3).
  const actualKey = `actual:${item.id}`;
  const enteringActual = budget !== null && openKey === actualKey;
  // 입력칸으로 열린 줄은 끌지 않는다. 다른 줄이 움직일 때 자리를 비켜 주도록 노드는 늘 등록한다.
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: !sortable || editing,
    attributes: { roleDescription: "순서 바꾸기" },
  });
  const sortStyle = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  const [done, setOptimisticDone] = useOptimistic(item.done);
  const [error, setError] = useState<string | null>(null);
  const [, startToggle] = useTransition();
  const [deleting, startDelete] = useTransition();

  // 완료 저장 실패 문구는 잠깐만 보인다(연결이 돌아온 뒤에도 실패처럼 남지 않게).
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [error]);

  function closeActual() {
    setOpenKey((current) => (current === actualKey ? null : current));
  }

  // 누르면 바로 화면에 반영하고 저장한다. 실패하면 전환이 끝날 때 서버 값으로 돌아가고 문구를 보인다.
  // 예산이 있으면 켤 때 실제 지출 칸을 연다. 실제를 적은 일정을 끄면 확인 뒤 완료 해제와 실제 삭제를 한 번에 한다.
  function toggleDone() {
    const next = !done;
    if (!next && item.actual) {
      const spent = formatMoney(item.actual.amount, item.actual.currency);
      if (
        !window.confirm(
          `완료를 풀면 적어 둔 실제 지출 ${spent}도 지워져요. 계속할까요?`,
        )
      ) {
        return;
      }
      setError(null);
      closeActual();
      startToggle(async () => {
        setOptimisticDone(false);
        const ok = await undoScheduleItemWithActualAction(tripId, item.id).then(
          (result) => result.ok,
          () => false,
        );
        if (!ok) setError(SAVE_FAILED);
      });
      return;
    }
    if (next && budget) setOpenKey(actualKey);
    else closeActual();
    setError(null);
    startToggle(async () => {
      setOptimisticDone(next);
      // 연결이 끊기면 요청 자체가 실패(reject)한다. 오류 화면으로 넘기지 않고 같은 실패 문구로 되돌린다.
      const ok = await setScheduleItemDoneAction(tripId, item.id, next).then(
        (result) => result.ok,
        () => false,
      );
      if (!ok) setError(SAVE_FAILED);
    });
  }

  function onDelete() {
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    startDelete(async () => {
      await deleteScheduleItemAction(tripId, item.id);
    });
  }

  // 저장에 성공하면 같은 전환 안에서 입력칸을 닫는다. 날짜를 옮기면 줄이 다른 날 칸에서 새로 그려져
  // 양식의 effect 가 돌기 전에 사라지므로, effect 로 닫으면 옮겨 간 자리에서 입력칸이 다시 열린다.
  async function saveAndClose(
    prev: ScheduleFormState,
    formData: FormData,
  ): Promise<ScheduleFormState> {
    const next = await updateScheduleItemAction(
      tripId,
      item.id,
      prev,
      formData,
    );
    // 저장하는 사이 다른 입력칸을 열었으면 그것은 그대로 둔다.
    if (next.savedAt !== prev.savedAt) {
      setOpenKey((current) => (current === key ? null : current));
    }
    return next;
  }

  if (editing) {
    const estimate = budget ? amountFieldValues(item.estimate, budget) : null;
    const actual = budget ? amountFieldValues(item.actual, budget) : null;
    const detail = actualDetailValues(item.actual);
    return (
      <li ref={setNodeRef} style={sortStyle}>
        <ScheduleItemForm
          mode="edit"
          action={saveAndClose}
          initialValues={{
            ...EMPTY_SCHEDULE_FIELDS,
            date: item.date,
            time: item.time,
            title: item.title ?? "",
            place: item.place ?? "",
            placeId: item.placeId ?? "",
            memo: item.memo ?? "",
            estimateAmount: estimate?.amount ?? "",
            estimateCurrency: estimate?.currency ?? "",
            actualAmount: actual?.amount ?? "",
            actualCurrency: actual?.currency ?? "",
            actualPaidOn: detail.paidOn,
            actualRate: detail.rate,
          }}
          dateOptions={dateOptions}
          places={places}
          searchEnabled={searchEnabled}
          budget={budget}
          showActual={item.done || item.actual !== null}
          actualRateSource={item.actual?.rateSource ?? null}
          onClose={() =>
            setOpenKey((current) => (current === key ? null : current))
          }
          onDelete={onDelete}
          deleting={deleting}
        />
      </li>
    );
  }

  // 이어진 장소가 목록에 있으면 그 장소의 Google 지도 링크(장소 id 포함), 아니면 글자로 검색.
  const linkedPlace =
    item.placeId === null
      ? undefined
      : places.find((place) => place.id === item.placeId);
  const placeHref = linkedPlace
    ? placeUrl(linkedPlace)
    : item.place
      ? mapsSearchUrl(item.place)
      : null;
  // 제목이 없으면 장소 이름이 제목 자리에 온다(#35).
  const name = item.title ?? item.place ?? "";

  // 손잡이로만 끈다(줄을 눌러 고치기·줄 위 터치 스크롤과 겹치지 않게). 손잡이에만 touch-action: none.
  return (
    <li
      ref={setNodeRef}
      style={sortStyle}
      className={`flex items-start gap-3 py-2 ${isDragging ? "relative z-10 rounded-lg bg-background shadow-lg" : ""}`}
    >
      {sortable ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`${name || "일정"} 순서 옮기기`}
          className="-my-2 flex h-11 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-zinc-400 select-none hover:text-zinc-600 active:cursor-grabbing dark:hover:text-zinc-300"
        >
          ⠿
        </button>
      ) : (
        <span className="w-6 shrink-0" />
      )}
      <span className="w-12 shrink-0 pt-0.5 text-sm tabular-nums text-zinc-500">
        {item.time}
      </span>
      <div
        className={`flex min-w-0 flex-1 flex-col gap-0.5 ${done ? "opacity-50" : ""}`}
      >
        <button
          type="button"
          onClick={() => setOpenKey(key)}
          className={`self-start text-left font-medium break-words hover:underline ${done ? "line-through" : ""}`}
        >
          {name}
        </button>
        {item.place && placeHref && (
          <a
            href={placeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-sm text-zinc-600 break-words hover:underline dark:text-zinc-400"
          >
            📍 {item.title === null ? "지도에서 보기" : item.place}
          </a>
        )}
        {item.memo && (
          <p className="text-sm whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400">
            {item.memo}
          </p>
        )}
        {enteringActual && budget && (
          <ActualEntry
            tripId={tripId}
            item={item}
            budget={budget}
            onClose={closeActual}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
      <input
        type="checkbox"
        checked={done}
        onChange={toggleDone}
        aria-label={`${name} 완료`}
        className="mt-1 size-5 shrink-0 accent-foreground"
      />
    </li>
  );
}

// 완료 체크칸을 켠 뒤 그 줄 아래에 열리는 실제 지출 칸 하나(§5.7.3). 처음 값은 적어 둔 실제 → 예상 → 빈칸.
// 저장하면 닫히고, 건너뛰기(돈을 안 쓴 일정)는 실제를 쓰지 않고 닫는다. 빈칸으로 저장하면 실제를 지운다.
function ActualEntry({
  tripId,
  item,
  budget,
  onClose,
}: {
  tripId: string;
  item: RowItem;
  budget: BudgetCurrencies;
  onClose: () => void;
}) {
  const initial = amountFieldValues(item.actual ?? item.estimate, budget);
  const [amount, setAmount] = useState(initial.amount);
  const [currency, setCurrency] = useState(initial.currency);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `actual-${item.id}`;

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startSave(async () => {
      const result = await setScheduleItemActualAction(
        tripId,
        item.id,
        amount,
        currency,
      ).catch(() => ({ ok: false as const, error: SAVE_FAILED }));
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  const choices = budget.localCurrency
    ? [budget.localCurrency, budget.currency]
    : null;
  return (
    <form onSubmit={save} noValidate className="mt-1 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          실제 지출
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          className={`${inputClass} w-32 py-1.5`}
        />
        {choices && (
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="실제 지출 통화"
            className={`${inputClass} w-auto py-1.5`}
          >
            {choices.map((code) => (
              <option key={code} value={code}>
                {currencyLabel(code)}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {saving ? "저장하는 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
        >
          건너뛰기
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
