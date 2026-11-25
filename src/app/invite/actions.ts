"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listDayOrder, writeDayOrder } from "@/db/queries/schedule-items";
import {
  countTripMembers,
  findInvite,
  type JoinResult,
  joinTrip,
  MAX_MEMBERS_PER_TRIP,
} from "@/db/queries/trip-members";
import { getTrip } from "@/db/queries/trips";
import { hashInviteToken, isInviteToken } from "@/lib/invite-token";
import { settleMovedItems } from "@/lib/schedule-order";
import { getCurrentUser } from "@/lib/session";
import { INVITE_INVALID, MEMBER_LIMIT, SAVE_FAILED } from "../trips/messages";

// [참여](#15 설계 §5.3 의 4). token 은 bind 로 오지만 클라이언트가 바꿀 수 있는 값이다.
// 형식 검사 뒤 해시로만 찾고, 링크 확인과 넣기는 한 SQL 문(joinTrip)이 한다.
export async function joinTripAction(
  token: string,
): Promise<{ error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (typeof token !== "string" || !isInviteToken(token)) {
    return { error: INVITE_INVALID };
  }
  const hash = hashInviteToken(token);

  let joined: JoinResult | null;
  try {
    joined = await joinTrip(user.id, hash);
  } catch {
    return { error: SAVE_FAILED };
  }
  if (joined) {
    await settleReattachedDays(user.id, joined);
    revalidatePath("/trips");
    revalidatePath(`/trips/${joined.tripId}`);
    if (joined.reattachedRecordId) {
      revalidatePath(`/trips/${joined.reattachedRecordId}`);
    }
    redirect(`/trips/${joined.tripId}`);
  }

  // 넣지 못한 까닭을 가린다.
  let reason: { error: string } | { tripId: string };
  try {
    const invite = await findInvite(hash);
    if (!invite) {
      reason = { error: INVITE_INVALID };
    } else if (await getTrip(user.id, invite.tripId)) {
      reason = { tripId: invite.tripId };
    } else if (
      (await countTripMembers(invite.tripId)) >= MAX_MEMBERS_PER_TRIP
    ) {
      reason = { error: MEMBER_LIMIT };
    } else {
      reason = { error: SAVE_FAILED };
    }
  } catch {
    return { error: SAVE_FAILED };
  }
  if ("tripId" in reason) redirect(`/trips/${reason.tripId}`);
  return reason;
}

// 떼어 낸 기록에서 돌아온 나만 일정(#103 §5.4-1)을 날마다 시각 순 자리에 넣는다. joinTrip 이 position 을 비워 두었다.
// 참여·붙이기는 이미 끝났으므로 실패해도 오류로 돌려주지 않는다(schedule-actions 의 settleDayOrder 와 같음).
// 그 줄은 그날 맨 뒤에 보일 수 있고, 끌어 옮기면 다시 맞춰진다.
async function settleReattachedDays(
  userId: string,
  { tripId, movedItems }: JoinResult,
): Promise<void> {
  const byDate = new Map<string, string[]>();
  for (const item of movedItems) {
    byDate.set(item.date, [...(byDate.get(item.date) ?? []), item.id]);
  }
  for (const [date, ids] of byDate) {
    try {
      const order = settleMovedItems(
        await listDayOrder(userId, tripId, date),
        ids,
      );
      if (order.length === 0) continue;
      if (!(await writeDayOrder(userId, tripId, date, order))) {
        console.warn(
          "[schedule-order] 돌아온 일정의 그날 순서를 모두 쓰지 못했어요.",
        );
      }
    } catch {
      console.warn("[schedule-order] 돌아온 일정의 그날 순서를 쓰지 못했어요.");
    }
  }
}
