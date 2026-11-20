"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  clearInviteToken,
  leaveTrip,
  removeMember,
  setInviteTokenHash,
} from "@/db/queries/trip-members";
import { generateInviteToken, hashInviteToken } from "@/lib/invite-token";
import { getCurrentUser } from "@/lib/session";
import { SAVE_FAILED } from "./messages";

// 함께하는 사람·초대 링크 동작(#15). tripId·memberUserId 는 클라이언트가 바꿀 수 있는 값이다.
// 쿼리의 uuid 검사와 주인 조건(ownedTrips)·본인 조건이 막는다. 바뀐 행이 없으면 찾을 수 없음.

function revalidateTrip(tripId: string) {
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
}

// 원문 비밀값은 이 응답으로 한 번만 돌려준다. 주소는 클라이언트가 location.origin 으로 만든다(Host 머리글을 믿지 않음).
export async function createInviteLinkAction(
  tripId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const token = generateInviteToken();
  let saved: boolean;
  try {
    saved = await setInviteTokenHash(user.id, tripId, hashInviteToken(token));
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  if (!saved) notFound();

  revalidateTrip(tripId);
  return { ok: true, token };
}

export async function turnOffInviteLinkAction(
  tripId: string,
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  let saved: boolean;
  try {
    saved = await clearInviteToken(user.id, tripId);
  } catch {
    return { error: SAVE_FAILED };
  }
  if (!saved) notFound();

  revalidateTrip(tripId);
  return { error: null };
}

export async function removeMemberAction(
  tripId: string,
  memberUserId: string,
): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  // Better Auth 의 user id 는 uuid 가 아니다. 문자열·길이만 본다.
  if (
    typeof memberUserId !== "string" ||
    memberUserId.length < 1 ||
    memberUserId.length > 200
  ) {
    notFound();
  }

  let removed: boolean;
  try {
    removed = await removeMember(user.id, tripId, memberUserId);
  } catch {
    return { error: SAVE_FAILED };
  }
  if (!removed) notFound();

  revalidateTrip(tripId);
  return { error: null };
}

export async function leaveTripAction(
  tripId: string,
): Promise<{ error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  let left: boolean;
  try {
    left = await leaveTrip(user.id, tripId);
  } catch {
    return { error: SAVE_FAILED };
  }
  if (!left) notFound();

  revalidateTrip(tripId);
  redirect("/trips");
}
