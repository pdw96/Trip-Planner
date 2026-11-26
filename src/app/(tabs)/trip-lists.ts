import "server-only";
import { listTripCompanions } from "@/db/queries/trip-members";
import { listTrips, type TripListItem } from "@/db/queries/trips";
import { groupTrips } from "@/lib/trip-dates";
import { countCompanions, namesByTrip } from "@/lib/trip-people";

// 탭 화면(#122)이 쓰는 여행 목록. 함께한 사람의 user id 는 이 함수 안에서만 쓰고(같은 사람 세기),
// 돌려주는 값에는 이름과 횟수만 담는다(#103).
export type ListedTrip = TripListItem & {
  // 나를 뺀 함께한 사람 이름(주인 → 참여 순).
  people: string[];
};

export type TripLists = ReturnType<typeof groupTrips<ListedTrip>> & {
  companions: { name: string; count: number }[];
};

export async function loadTripLists(
  userId: string,
  today: string,
): Promise<TripLists> {
  const [trips, rows] = await Promise.all([
    listTrips(userId),
    listTripCompanions(userId),
  ]);
  const names = namesByTrip(rows);
  const listed = trips.map((trip) => ({
    ...trip,
    people: names.get(trip.id) ?? [],
  }));
  const groups = groupTrips(listed, today);
  const memoryIds = groups.memories.flatMap((m) => m.trips.map((t) => t.id));
  return { ...groups, companions: countCompanions(rows, memoryIds) };
}
