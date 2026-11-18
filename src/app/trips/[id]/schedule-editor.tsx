"use client";

import {
  createContext,
  use,
  useLayoutEffect,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { mapsSearchUrl } from "@/lib/schedule";
import { EMPTY_SCHEDULE_FIELDS } from "@/lib/schedule-input";
import {
  createScheduleItemAction,
  deleteScheduleItemAction,
  setScheduleItemDoneAction,
  updateScheduleItemAction,
} from "../schedule-actions";
import { type DateOption, ScheduleItemForm } from "./schedule-item-form";

export type { DateOption };

// time 은 화면용 "HH:MM"(없으면 "").
export type RowItem = {
  id: string;
  date: string;
  time: string;
  title: string;
  place: string | null;
  memo: string | null;
  done: boolean;
};

const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

// 입력칸은 화면 전체에서 하나만 열린다. 키: "add:<날짜>" 또는 "edit:<일정 id>".
type OpenState = {
  openKey: string | null;
  setOpenKey: (key: string | null) => void;
};

const OpenContext = createContext<OpenState | null>(null);

function useOpen(): OpenState {
  const value = use(OpenContext);
  if (!value) throw new Error("ScheduleEditorProvider 안에서만 쓸 수 있어요.");
  return value;
}

// Next 는 지나온 화면을 숨겨 보관(Activity)하므로, 화면을 떠날 때 열린 입력칸을 닫는다.
// (그대로 두면 다음 방문에 쓰다 만 입력칸이나 지난 오류 문구가 남는다.)
export function ScheduleEditorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  useLayoutEffect(() => () => setOpenKey(null), []);
  return <OpenContext value={{ openKey, setOpenKey }}>{children}</OpenContext>;
}

export function AddScheduleItem({
  tripId,
  date,
}: {
  tripId: string;
  date: string;
}) {
  const { openKey, setOpenKey } = useOpen();
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
      onClose={() => setOpenKey(null)}
    />
  );
}

export function ScheduleItemRow({
  tripId,
  item,
  dateOptions,
}: {
  tripId: string;
  item: RowItem;
  dateOptions: DateOption[];
}) {
  const { openKey, setOpenKey } = useOpen();
  const key = `edit:${item.id}`;
  const [done, setOptimisticDone] = useOptimistic(item.done);
  const [error, setError] = useState<string | null>(null);
  const [, startToggle] = useTransition();
  const [deleting, startDelete] = useTransition();

  // 누르면 바로 화면에 반영하고 저장한다. 실패하면 전환이 끝날 때 서버 값으로 돌아가고 문구를 보인다.
  function toggleDone() {
    const next = !done;
    setError(null);
    startToggle(async () => {
      setOptimisticDone(next);
      const result = await setScheduleItemDoneAction(tripId, item.id, next);
      if (!result.ok) setError(SAVE_FAILED);
    });
  }

  function onDelete() {
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    startDelete(async () => {
      await deleteScheduleItemAction(tripId, item.id);
    });
  }

  if (openKey === key) {
    return (
      <li>
        <ScheduleItemForm
          mode="edit"
          action={updateScheduleItemAction.bind(null, tripId, item.id)}
          initialValues={{
            date: item.date,
            time: item.time,
            title: item.title,
            place: item.place ?? "",
            memo: item.memo ?? "",
          }}
          dateOptions={dateOptions}
          onClose={() => setOpenKey(null)}
          onDelete={onDelete}
          deleting={deleting}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 py-2">
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
          {item.title}
        </button>
        {item.place && (
          <a
            href={mapsSearchUrl(item.place)}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-sm text-zinc-600 break-words hover:underline dark:text-zinc-400"
          >
            📍 {item.place}
          </a>
        )}
        {item.memo && (
          <p className="text-sm whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400">
            {item.memo}
          </p>
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
        aria-label={`${item.title} 완료`}
        className="mt-1 size-5 shrink-0 accent-foreground"
      />
    </li>
  );
}
