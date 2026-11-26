import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  emptyStateClass,
  primaryButtonClass,
  subTitleClass,
} from "@/app/ui/styles";
import { TripRow } from "@/app/ui/trip-row";
import { getCurrentUser } from "@/lib/session";
import { todayInSeoul } from "@/lib/trip-dates";
import { withNames } from "@/lib/trip-people";
import { TabPageHeader } from "../tab-page-header";
import { loadTripLists, type TripLists } from "../trip-lists";

// 내 여행 탭(#122 설계 §5.5): 혼자 가는 앞으로의 여행과, 다녀온 모든 여행(추억).
export default function MinePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <TabPageHeader
        title="내 여행"
        description="혼자 간 여행, 함께 간 여행, 떼어 낸 기록까지 내 여행을 모두 모았어요."
      />
      <Suspense fallback={<p className="text-sub">불러오는 중…</p>}>
        <MineContent />
      </Suspense>
    </main>
  );
}

async function MineContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const today = todayInSeoul();
  const lists = await loadTripLists(user.id, today);
  const { together, ahead, memories } = lists;

  if (together.length === 0 && ahead.length === 0 && memories.length === 0) {
    return (
      <div className={emptyStateClass}>
        <p className="font-semibold">아직 여행이 없어요</p>
        <p className="text-sm text-sub">
          첫 여행을 만들거나, 친구에게 받은 초대 링크를 열어 함께 가는 여행에
          들어가 보세요.
        </p>
        <Link href="/trips/new" className={primaryButtonClass}>
          새 여행 만들기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {ahead.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={subTitleClass}>앞으로</h2>
          <ul className="flex flex-col border-b border-rule">
            {ahead.map((trip) => (
              <TripRow key={trip.id} trip={trip} today={today} />
            ))}
          </ul>
        </section>
      )}
      {together.length > 0 && (
        <p className="-mt-6 text-[12.5px] text-sub">
          함께 가는 여행은 함께 탭에 있어요.
        </p>
      )}
      <Memories lists={lists} today={today} />
    </div>
  );
}

const MAX_CHIPS = 12;

function Memories({ lists, today }: { lists: TripLists; today: string }) {
  const { memories, memoryCount, thisYearCount, companions } = lists;

  if (memories.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className={subTitleClass}>추억</h2>
        <p className="text-sm text-sub">
          다녀온 여행이 아직 없어요. 여행이 끝나면 여기에 모여요.
        </p>
      </section>
    );
  }

  const chips = companions.slice(0, MAX_CHIPS);
  const hidden = companions.length - chips.length;
  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className={subTitleClass}>추억</h2>
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="올해" value={`${thisYearCount}번`} />
          <Stat label="모두" value={`${memoryCount}번`} />
          <Stat label="함께 간 사람" value={`${companions.length}명`} />
        </dl>
        {chips.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-sub">함께 간 사람</h3>
            <ul className="flex flex-wrap gap-2">
              {chips.map((person, i) => (
                <li
                  // 같은 이름의 다른 사람이 있을 수 있고, 계정 번호는 화면으로 넘기지 않는다(#103). 서버에서 한 번 그리는 목록이라 순서 키로 충분하다.
                  // biome-ignore lint/suspicious/noArrayIndexKey: 위 주석
                  key={`${i}-${person.name}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-sm"
                >
                  <span className="font-semibold">{person.name}</span>
                  <span className="text-[13px] text-sub">
                    {person.count}번 함께
                  </span>
                </li>
              ))}
              {hidden > 0 && (
                <li className="inline-flex items-center rounded-full border border-rule px-3 py-1.5 text-sm text-sub">
                  외 {hidden}명
                </li>
              )}
            </ul>
            <p className="text-[12.5px] text-sub">
              같은 사람과 여러 번 가도 한 명으로 세요.
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Placeholder title="다녀온 곳 지도" />
          <Placeholder title="내가 쓴 돈" />
        </div>
      </section>
      {memories.map((group) => (
        <section key={group.year} className="flex flex-col gap-2">
          <h2 className={subTitleClass}>
            {group.year}년 · {group.trips.length}번
          </h2>
          <ul className="flex flex-col border-b border-rule">
            {group.trips.map((trip) => (
              <TripRow
                key={trip.id}
                trip={trip}
                today={today}
                meta={withNames(trip.people)}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-surface p-3">
      <dt className="text-xs text-sub">{label}</dt>
      <dd className="text-xl font-bold">{value}</dd>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-dashed border-field-line p-3.5">
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-[12.5px] text-sub">다음에 더해요</span>
    </div>
  );
}
