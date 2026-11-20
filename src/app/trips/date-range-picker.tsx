"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import {
  errorTextClass,
  fieldClass,
  primaryButtonClass,
} from "@/app/ui/styles";
import {
  type CalendarRange,
  formatSelection,
  initialSelection,
  monthCells,
  monthsInRange,
  monthTitle,
  nextSelection,
  type Selection,
  weekdayName,
} from "@/lib/calendar";

// 숙소 예약 앱처럼 달력 하나에서 시작일과 끝일을 차례로 고른다.
// 고른 값은 숨은 입력(startDate, endDate)으로 양식에 실리고, 검증은 여전히 서버가 한다.

const WEEKDAY_HEADER = ["일", "월", "화", "수", "목", "금", "토"];
const NO_HOLIDAYS: ReadonlySet<string> = new Set();

type Props = {
  startDate: string;
  endDate: string;
  today: string;
  range: CalendarRange;
  holidays: Promise<string[]>;
  error: string | undefined;
};

export function DateRangePicker({
  startDate,
  endDate,
  today,
  range,
  holidays,
  error,
}: Props) {
  const [applied, setApplied] = useState({ startDate, endDate });
  const [draft, setDraft] = useState<Selection>({ start: null, end: null });
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const summary = formatSelection(
    initialSelection(applied.startDate, applied.endDate),
    today,
  );
  const errorId = "trip-dates-error";

  function openPicker() {
    setDraft(initialSelection(applied.startDate, applied.endDate));
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function apply() {
    if (!draft.start || !draft.end) return;
    setApplied({ startDate: draft.start, endDate: draft.end });
    dialogRef.current?.close();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="trip-dates" className="text-[13px] font-semibold">
        여행 날짜
      </label>
      <button
        id="trip-dates"
        type="button"
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`w-full ${fieldClass} text-left`}
      >
        {summary || <span className="text-sub">날짜를 선택해 주세요</span>}
      </button>
      <input type="hidden" name="startDate" value={applied.startDate} />
      <input type="hidden" name="endDate" value={applied.endDate} />
      {error && (
        <p id={errorId} role="alert" className={errorTextClass}>
          {error}
        </p>
      )}

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 바깥(backdrop) 클릭 닫기. 키보드는 dialog 기본 동작(Esc)으로 닫힌다 */}
      <dialog
        ref={dialogRef}
        aria-labelledby="trip-dates-title"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // 바깥(backdrop)을 누르면 아무것도 바꾸지 않고 닫는다.
          if (e.target === dialogRef.current) dialogRef.current.close();
        }}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none flex-col rounded-t-3xl bg-background p-0 text-foreground backdrop:bg-black/50 open:flex sm:m-auto sm:max-h-[80dvh] sm:max-w-md sm:rounded-3xl"
      >
        {open && (
          <PickerSheet
            draft={draft}
            today={today}
            range={range}
            holidays={holidays}
            onPick={(date) => setDraft((sel) => nextSelection(sel, date))}
            onApply={apply}
            onClose={() => dialogRef.current?.close()}
          />
        )}
      </dialog>
    </div>
  );
}

function PickerSheet({
  draft,
  today,
  range,
  holidays,
  onPick,
  onApply,
  onClose,
}: {
  draft: Selection;
  today: string;
  range: CalendarRange;
  holidays: Promise<string[]>;
  onPick: (date: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const summary = formatSelection(draft, today);
  const complete = draft.start !== null && draft.end !== null;

  // 처음 열 때 시작일의 달(없으면 이번 달)로 스크롤한다. 고를 때마다 움직이지 않도록 열릴 때 한 번만.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 열릴 때 한 번만 실행
  useEffect(() => {
    const target = (draft.start ?? today).slice(0, 7);
    const list = listRef.current;
    const month = list?.querySelector<HTMLElement>(`[data-month="${target}"]`);
    if (list && month) list.scrollTop = month.offsetTop;
  }, []);

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-rule px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <h2 id="trip-dates-title" className="text-lg font-bold">
            여행 날짜 선택
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex size-9 items-center justify-center rounded-[8px] text-xl hover:bg-surface"
          >
            ✕
          </button>
        </div>
        <p aria-live="polite" className="min-h-6 font-medium">
          {summary || "시작 날짜를 골라 주세요"}
          {draft.start && !draft.end && (
            <span className="ml-2 text-sm text-sub">끝 날짜를 골라 주세요</span>
          )}
        </p>
        <div className="grid grid-cols-7 text-center text-sm text-sub">
          {WEEKDAY_HEADER.map((name, i) => (
            <span key={name} className={i === 0 ? "text-danger" : undefined}>
              {name}
            </span>
          ))}
        </div>
      </div>

      <div
        ref={listRef}
        className="relative min-h-0 flex-1 overflow-y-auto px-3"
      >
        <Suspense
          fallback={
            <MonthList
              draft={draft}
              today={today}
              range={range}
              holidays={NO_HOLIDAYS}
              onPick={onPick}
            />
          }
        >
          <MonthListWithHolidays
            draft={draft}
            today={today}
            range={range}
            holidays={holidays}
            onPick={onPick}
          />
        </Suspense>
      </div>

      <div className="border-t border-rule p-4">
        <button
          type="button"
          onClick={onApply}
          disabled={!complete}
          className={`${primaryButtonClass} w-full`}
        >
          적용하기
        </button>
      </div>
    </>
  );
}

function MonthListWithHolidays({
  holidays,
  ...props
}: Omit<MonthListProps, "holidays"> & { holidays: Promise<string[]> }) {
  const list = use(holidays);
  const set = useMemo(() => new Set(list), [list]);
  return <MonthList {...props} holidays={set} />;
}

type MonthListProps = {
  draft: Selection;
  today: string;
  range: CalendarRange;
  holidays: ReadonlySet<string>;
  onPick: (date: string) => void;
};

function MonthList({ draft, today, range, holidays, onPick }: MonthListProps) {
  const months = useMemo(() => monthsInRange(range), [range]);
  return (
    <>
      {months.map((ym) => {
        const key = monthTitle(ym).replace(".", "-");
        return (
          <section key={key} data-month={key} className="pt-5 pb-2">
            <h3 className="mb-2 text-center font-semibold">{monthTitle(ym)}</h3>
            <div className="grid grid-cols-7 gap-y-1">
              {monthCells(ym).map((cell, i) =>
                cell ? (
                  <DayButton
                    key={cell.date}
                    date={cell.date}
                    day={cell.day}
                    weekday={cell.weekday}
                    draft={draft}
                    today={today}
                    holiday={holidays.has(cell.date)}
                    onPick={onPick}
                  />
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 앞쪽 빈칸은 순서만 있다
                  <span key={`blank-${i}`} />
                ),
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}

function DayButton({
  date,
  day,
  weekday,
  draft,
  today,
  holiday,
  onPick,
}: {
  date: string;
  day: number;
  weekday: number;
  draft: Selection;
  today: string;
  holiday: boolean;
  onPick: (date: string) => void;
}) {
  const { start, end } = draft;
  const isStart = date === start;
  const isEnd = date === end;
  const sameDay = isStart && isEnd;
  const inside = start !== null && end !== null && date > start && date < end;
  const selected = isStart || isEnd;
  const red = weekday === 0 || holiday;

  const role = sameDay ? "당일" : isStart ? "시작" : isEnd ? "끝" : "";
  const [y, m, d] = date.split("-").map(Number);
  const label = `${y}년 ${m}월 ${d}일 ${weekdayName(date)}요일${holiday ? ", 공휴일" : ""}${role ? `, ${role}` : ""}`;

  // 시작~끝 사이는 띠로 칠한다. 시작은 오른쪽 절반, 끝은 왼쪽 절반만.
  const band = inside
    ? "bg-surface"
    : isStart && end !== null && !sameDay
      ? "bg-linear-to-r from-transparent from-50% to-surface to-50%"
      : isEnd && !sameDay
        ? "bg-linear-to-r from-surface from-50% to-transparent to-50%"
        : "";

  return (
    <div className={`flex h-14 items-start justify-center ${band}`}>
      <button
        type="button"
        onClick={() => onPick(date)}
        aria-label={label}
        aria-pressed={selected}
        className={`flex h-14 w-12 flex-col items-center justify-center rounded-[10px] ${
          selected ? "bg-foreground text-on-ink" : red ? "text-danger" : ""
        } ${date === today ? "font-bold underline underline-offset-4" : ""}`}
      >
        <span>{day}</span>
        {role && <span className="text-[10px] leading-3">{role}</span>}
      </button>
    </div>
  );
}
