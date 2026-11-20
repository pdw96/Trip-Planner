"use client";

import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { legText, NOTICES } from "@/lib/leg-display";
import { keepsTimeOrder } from "@/lib/schedule-order";
import { type LineLeg, placeTravelLines } from "@/lib/travel-lines";
import { ORDER_SAVE_FAILED, ORDER_TIME_RULE } from "../messages";
import { reorderScheduleItemsAction } from "../schedule-actions";
import { useDayRoute } from "./day-route-store";
import {
  type DateOption,
  type RowItem,
  ScheduleItemRow,
} from "./schedule-editor";
import { useDwellVisible } from "./use-dwell-visible";

// 일정표 한 날의 일정 줄과, 그 사이 예상 이동 시간 줄(#37).
// 날이 화면에 머물면 그날 구간을 묻는다(지도 N일차 탭과 결과를 함께 쓴다, ./day-route-store).
// 이동 줄 자리는 응답 구간의 일정 id 로 정한다. 답이 오기 전·실패면 서버가 만든 뼈대로 자리만 잡는다.
// 줄은 손잡이로 끌어 순서를 바꾼다(#41). 시각 있는 일정끼리의 시각 순서를 깨는 자리에는 놓을 수 없다.
// 기간 밖 일정 묶음도 이 컴포넌트를 쓴다(travel 은 null).

export type TravelSkeletonLeg = LineLeg & {
  distanceText: string;
  directionsUrl: string;
};

// 구간이 없는 날은 null.
export type DayTravel = {
  date: string;
  signature: string;
  legs: TravelSkeletonLeg[];
  // 여행 장소 id → 이름표. 응답 구간의 출발지 문구에 쓴다.
  labels: Record<string, string>;
};

type LineView = LineLeg & {
  text: string;
  directionsUrl: string;
  failed: boolean;
};

const LOADING_TEXT = "이동 시간 불러오는 중…";
const NOTICE_VISIBLE_MS = 4000;

// 위아래로만 끈다.
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function itemName(item: RowItem): string {
  return item.title ?? item.place ?? "일정";
}

// 끌어 놓은 결과. 같은 자리면 null, 시각 순서를 깨면 ok false.
function planMove(
  items: RowItem[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier | undefined,
): { next: RowItem[]; ok: boolean; index: number } | null {
  if (overId === undefined || activeId === overId) return null;
  const from = items.findIndex((item) => item.id === activeId);
  const to = items.findIndex((item) => item.id === overId);
  if (from === -1 || to === -1) return null;
  const next = arrayMove(items, from, to);
  const ok = keepsTimeOrder(
    next.map((item) => ({ id: item.id, time: item.time || null })),
  );
  return { next, ok, index: to };
}

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "Space 키로 일정을 들고, 위아래 방향키로 옮긴 뒤 Space 키로 놓아요. Esc 키로 취소해요.",
};

export function ScheduleDayItems({
  tripId,
  date,
  items,
  dateOptions,
  travel,
}: {
  tripId: string;
  date: string;
  items: RowItem[];
  dateOptions: DateOption[];
  travel: DayTravel | null;
}) {
  const router = useRouter();
  const dndId = useId();
  // 놓으면 바로 그 순서로 보이고 저장한다. 성공하면 같은 전환 안에서 서버 값으로, 실패하면 원래 순서로 돌아간다.
  const [ordered, setOrdered] = useOptimistic(items);
  const [, startReorder] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const nameOf = (id: UniqueIdentifier) => {
    const item = ordered.find((x) => x.id === id);
    return item ? `‘${itemName(item)}’` : "일정";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${nameOf(active.id)} 일정을 들었어요.`,
    onDragOver: ({ active, over }) => {
      const move = planMove(ordered, active.id, over?.id);
      if (!move) return `${nameOf(active.id)} 일정이 제자리에 있어요.`;
      return move.ok
        ? `${move.index + 1}번째 자리예요.`
        : `${move.index + 1}번째 자리에는 놓을 수 없어요. ${ORDER_TIME_RULE}.`;
    },
    onDragEnd: ({ active, over }) => {
      const move = planMove(ordered, active.id, over?.id);
      if (!move) return `${nameOf(active.id)} 일정을 제자리에 놓았어요.`;
      return move.ok
        ? `${nameOf(active.id)} 일정을 ${move.index + 1}번째 자리로 옮겼어요.`
        : `${ORDER_TIME_RULE}. 원래 자리로 돌아갔어요.`;
    },
    onDragCancel: ({ active }) =>
      `옮기기를 취소했어요. ${nameOf(active.id)} 일정은 원래 자리에 있어요.`,
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(false);
    const move = planMove(ordered, active.id, over?.id);
    if (!move) return;
    if (!move.ok) {
      setNotice(ORDER_TIME_RULE);
      return;
    }
    setNotice(null);
    startReorder(async () => {
      setOrdered(move.next);
      // 연결이 끊기면 요청 자체가 실패(reject)한다. 같은 실패 문구로 되돌린다.
      const ok = await reorderScheduleItemsAction(
        tripId,
        date,
        move.next.map((item) => item.id),
      ).then(
        (result) => result.ok,
        () => false,
      );
      if (!ok) {
        setNotice(ORDER_SAVE_FAILED);
        // 그 사이 다른 창에서 일정이 바뀌었을 수 있으므로 서버 값으로 새로 고친다.
        router.refresh();
      }
    });
  }

  // 어긋난 구간이 보이지 않게 이동 줄을 감춘다. 끄는 동안은 자리는 남기고 보이지만 않게(줄이 빠지면 끄는 줄이
  // 손가락에서 어긋난다), 놓은 뒤 저장이 끝나기 전(보이는 순서가 서버 순서와 다름)에는 뺀다.
  const reordering =
    ordered.map((item) => item.id).join() !==
    items.map((item) => item.id).join();
  const sortable = ordered.length > 1;

  const dayRef = useRef<HTMLDivElement>(null);
  const wanted = useDwellVisible(dayRef);
  const { result, reload } = useDayRoute(
    travel?.date ?? null,
    travel?.signature ?? "",
    travel !== null,
    wanted,
  );

  let lines: LineView[] = [];
  if (travel && result?.ok) {
    lines = result.legs.map((leg, i) => ({
      key: `r${i}:${leg.fromId}>${leg.toId}`,
      fromItemId: leg.fromItemId,
      toItemId: leg.toItemId,
      fromLabel: travel.labels[leg.fromId] ?? null,
      toLabel: travel.labels[leg.toId] ?? null,
      text: leg.text !== "" ? leg.text : `직선 ${leg.distanceText}`,
      directionsUrl: leg.directionsUrl,
      failed: leg.result.kind === "failed",
    }));
  } else if (travel) {
    lines = travel.legs.map((leg) => ({
      ...leg,
      text: result === null ? LOADING_TEXT : legText({ kind: "failed" }),
      failed: result !== null,
    }));
  }
  const placed = placeTravelLines(
    ordered.map((item) => item.id),
    reordering ? [] : lines,
  );

  // 감싸개는 하나로 늘 그린다(빈 날에 첫 일정을 넣어도 같은 요소를 계속 지켜보도록).
  // 일정 줄은 일정 id 로 묶어(Fragment key) 앞에 일정이 들어오거나 빠져도 뒤 줄이 다시 마운트되지 않게 한다.
  return (
    <div ref={dayRef} className="flex flex-col gap-1">
      {ordered.length === 0 ? (
        <p className="py-2 text-sm text-zinc-500">아직 일정이 없어요</p>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[verticalOnly]}
          accessibility={{
            announcements,
            screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
          }}
          onDragStart={() => {
            setDragging(true);
            setNotice(null);
          }}
          onDragCancel={() => setDragging(false)}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={ordered.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col">
              {ordered.map((item) => {
                const line = placed.before.get(item.id);
                return (
                  <Fragment key={item.id}>
                    {line && (
                      <TravelLine
                        line={line.leg}
                        caption={line.caption}
                        onRetry={reload}
                        concealed={dragging}
                      />
                    )}
                    <ScheduleItemRow
                      tripId={tripId}
                      item={item}
                      dateOptions={dateOptions}
                      sortable={sortable}
                    />
                  </Fragment>
                );
              })}
              {placed.after && (
                <TravelLine
                  line={placed.after.leg}
                  caption={placed.after.caption}
                  onRetry={reload}
                  concealed={dragging}
                />
              )}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {notice && (
        <p role="alert" className="text-sm text-red-600">
          {notice}
        </p>
      )}
      {result?.ok &&
        result.notices.map((notice) => (
          <p
            key={notice}
            className="text-sm text-zinc-600 break-words dark:text-zinc-400"
          >
            ⓘ {NOTICES[notice]}
          </p>
        ))}
    </div>
  );
}

// concealed: 자리는 차지하되 보이지 않음(끄는 동안).
function TravelLine({
  line,
  caption,
  onRetry,
  concealed,
}: {
  line: LineView;
  caption: string | null;
  onRetry: () => void;
  concealed: boolean;
}) {
  return (
    <li
      aria-hidden={concealed || undefined}
      className={`flex items-baseline gap-3 py-0.5 text-sm text-zinc-500 ${concealed ? "invisible" : ""}`}
    >
      <span className="w-6 shrink-0" />
      <span className="w-12 shrink-0" />
      <span className="min-w-0 flex-1 break-words">
        ↓ {caption && `${caption} · `}
        {line.text}
        {line.failed && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-2 text-zinc-600 underline dark:text-zinc-400"
          >
            다시
          </button>
        )}
      </span>
      <a
        href={line.directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 hover:underline"
      >
        길찾기 ↗
      </a>
    </li>
  );
}
