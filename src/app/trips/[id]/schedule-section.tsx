import { listPlaces } from "@/db/queries/places";
import { listScheduleItems } from "@/db/queries/schedule-items";
import type { ScheduleItem, Trip } from "@/db/schema";
import { dateLabel, displayTime, groupSchedule } from "@/lib/schedule";
import { lodgingFirst, type PlaceOption, toCategory } from "./map-types";
import {
  AddScheduleItem,
  type DateOption,
  type RowItem,
  ScheduleEditorProvider,
  ScheduleItemRow,
} from "./schedule-editor";

// 여행 자세히 보기의 날짜별 일정표. 여행 기간의 모든 날을 보이고, 기간 밖으로 밀려난 일정은 맨 아래에 따로 모은다.
// 호출하는 쪽이 이미 getTrip 으로 이 사용자의 여행임을 확인했다. 일정 쿼리도 같은 접근 조건을 다시 건다.
export async function ScheduleSection({
  userId,
  trip,
  today,
}: {
  userId: string;
  trip: Trip;
  today: string;
}) {
  const [items, placeRows] = await Promise.all([
    listScheduleItems(userId, trip.id),
    listPlaces(userId, trip.id),
  ]);
  // 일정 양식의 장소 고르기(숙소 먼저)와 이어진 장소의 링크에 쓴다.
  const placeOptions: PlaceOption[] = lodgingFirst(
    placeRows.map((p) => ({
      id: p.id,
      label: p.label,
      category: toCategory(p.category),
      googlePlaceId: p.googlePlaceId,
    })),
  );
  const { days, outside } = groupSchedule(items, trip.startDate, trip.endDate);
  const dayOptions: DateOption[] = days.map(({ day }) => ({
    value: day.date,
    label: day.label,
  }));
  const todayInTrip = today >= trip.startDate && today <= trip.endDate;
  // 장소 칸 Google 검색(#35). 브라우저 키는 공개 값(웹사이트 제한)이다. 자동완성에는 지도 ID 가 필요 없다.
  const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || null;

  function row(item: ScheduleItem, dateOptions: DateOption[]) {
    const rowItem: RowItem = {
      id: item.id,
      date: item.date,
      time: displayTime(item.time),
      title: item.title,
      place: item.place,
      placeId: item.placeId,
      memo: item.memo,
      done: item.done,
    };
    return (
      <ScheduleItemRow
        key={item.id}
        tripId={trip.id}
        item={rowItem}
        dateOptions={dateOptions}
      />
    );
  }

  return (
    <section aria-labelledby="schedule-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="schedule-heading" className="text-xl font-semibold">
          일정
        </h2>
        {todayInTrip && (
          <a
            href={`#day-${today}`}
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            오늘 일정으로 ↓
          </a>
        )}
      </div>
      <ScheduleEditorProvider places={placeOptions} browserKey={browserKey}>
        {days.map(({ day, items: dayItems }) => (
          <section
            key={day.date}
            id={`day-${day.date}`}
            aria-labelledby={`day-${day.date}-heading`}
            className="flex scroll-mt-4 flex-col gap-1"
          >
            <h3
              id={`day-${day.date}-heading`}
              className="flex items-center gap-2 font-semibold"
            >
              {day.label}
              {day.date === today && (
                <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
                  오늘
                </span>
              )}
            </h3>
            {dayItems.length > 0 ? (
              <ul className="flex flex-col">
                {dayItems.map((item) => row(item, dayOptions))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-zinc-500">아직 일정이 없어요</p>
            )}
            <AddScheduleItem tripId={trip.id} date={day.date} />
          </section>
        ))}
        {outside.length > 0 && (
          <section
            aria-labelledby="schedule-outside-heading"
            className="flex flex-col gap-3 rounded-2xl bg-black/[.04] px-5 py-4 dark:bg-white/[.06]"
          >
            <div className="flex flex-col gap-1">
              <h3 id="schedule-outside-heading" className="font-semibold">
                여행 기간 밖 일정
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                여행 날짜를 바꿔 기간 밖에 남은 일정이에요. 눌러서 날짜를
                옮기거나 지울 수 있어요.
              </p>
            </div>
            {outside.map((group) => (
              <div key={group.date} className="flex flex-col">
                <h4 className="text-sm font-medium">{group.label}</h4>
                <ul className="flex flex-col">
                  {group.items.map((item) =>
                    row(item, [
                      { value: item.date, label: dateLabel(item.date, true) },
                      ...dayOptions,
                    ]),
                  )}
                </ul>
              </div>
            ))}
          </section>
        )}
      </ScheduleEditorProvider>
    </section>
  );
}
