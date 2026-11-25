import "server-only";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { tripRecordCompanions, trips, user } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { ownedTrips } from "./trips";

// 기록 여행에 함께했던 사람의 이름. 기록의 주인만 읽는다. user id 는 돌려주지 않는다(브라우저로 나가지 않게, #103).
export async function listRecordCompanions(
  userId: string,
  tripId: string,
): Promise<{ name: string; wasOwner: boolean }[]> {
  if (!isUuid(tripId)) return [];
  return db
    .select({ name: user.name, wasOwner: tripRecordCompanions.wasOwner })
    .from(tripRecordCompanions)
    .innerJoin(trips, eq(trips.id, tripRecordCompanions.tripId))
    .innerJoin(user, eq(user.id, tripRecordCompanions.userId))
    .where(
      and(
        eq(tripRecordCompanions.tripId, tripId),
        ownedTrips(userId),
        isNotNull(trips.detachedAt),
      ),
    )
    .orderBy(desc(tripRecordCompanions.wasOwner), asc(user.name));
}
