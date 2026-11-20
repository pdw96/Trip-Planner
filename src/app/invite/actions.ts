"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  countTripMembers,
  findInvite,
  joinTrip,
  MAX_MEMBERS_PER_TRIP,
} from "@/db/queries/trip-members";
import { getTrip } from "@/db/queries/trips";
import { hashInviteToken, isInviteToken } from "@/lib/invite-token";
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

  let joined: string | null;
  try {
    joined = await joinTrip(user.id, hash);
  } catch {
    return { error: SAVE_FAILED };
  }
  if (joined) {
    revalidatePath("/trips");
    redirect(`/trips/${joined}`);
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
