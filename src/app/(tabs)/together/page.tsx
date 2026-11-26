import { redirect } from "next/navigation";
import { Suspense } from "react";
import { emptyStateClass } from "@/app/ui/styles";
import { TripRow } from "@/app/ui/trip-row";
import { getCurrentUser } from "@/lib/session";
import { todayInSeoul } from "@/lib/trip-dates";
import { peopleLine } from "@/lib/trip-people";
import { TabPageHeader } from "../tab-page-header";
import { loadTripLists } from "../trip-lists";

// 함께 탭(#122 설계 §5.4): 다른 사람과 같이 쓰는, 아직 끝나지 않은 여행.
export default function TogetherPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <TabPageHeader
        title="함께 가는 여행"
        description="다른 사람과 같이 계획하는 여행이에요. 여행이 끝나면 내 여행의 추억으로 옮겨 가요."
      />
      <Suspense fallback={<p className="text-sub">불러오는 중…</p>}>
        <TogetherList />
      </Suspense>
    </main>
  );
}

async function TogetherList() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const today = todayInSeoul();
  const { together } = await loadTripLists(user.id, today);

  if (together.length === 0) {
    return (
      <div className={emptyStateClass}>
        <p className="font-semibold">함께 가는 여행이 없어요</p>
        <p className="text-sm text-sub">
          여행을 열고 초대 링크로 함께 갈 사람을 불러 보세요.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col border-b border-rule">
      {together.map((trip) => (
        <TripRow
          key={trip.id}
          trip={trip}
          today={today}
          line={peopleLine(trip.people)}
        />
      ))}
    </ul>
  );
}
