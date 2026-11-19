"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { placeUrl } from "@/lib/leg-display";
import { mapsSearchUrl } from "@/lib/schedule";
import {
  EMPTY_SCHEDULE_FIELDS,
  type ScheduleFormState,
} from "@/lib/schedule-input";
import { SAVE_FAILED } from "../messages";
import {
  createScheduleItemAction,
  deleteScheduleItemAction,
  setScheduleItemDoneAction,
  updateScheduleItemAction,
} from "../schedule-actions";
import type { PlaceOption } from "./map-types";
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
};

const ERROR_VISIBLE_MS = 4000;

// 입력칸은 화면 전체에서 하나만 열린다. 키: "add:<날짜>" 또는 "edit:<일정 id>".
// places: 이 여행의 장소(숙소 먼저). 양식의 장소 고르기와 이어진 장소의 링크에 쓴다.
// searchEnabled: 장소 칸에서 Google 검색을 보일지(브라우저 키가 있을 때, #35).
type OpenState = {
  openKey: string | null;
  setOpenKey: React.Dispatch<React.SetStateAction<string | null>>;
  places: PlaceOption[];
  searchEnabled: boolean;
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
  children,
}: {
  places: PlaceOption[];
  browserKey: string | null;
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
  const { openKey, setOpenKey, places, searchEnabled } = useOpen();
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
  const { openKey, setOpenKey, places, searchEnabled } = useOpen();
  const key = `edit:${item.id}`;
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

  // 누르면 바로 화면에 반영하고 저장한다. 실패하면 전환이 끝날 때 서버 값으로 돌아가고 문구를 보인다.
  function toggleDone() {
    const next = !done;
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

  if (openKey === key) {
    return (
      <li>
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
          }}
          dateOptions={dateOptions}
          places={places}
          searchEnabled={searchEnabled}
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
