import { getInviteCreatedAt, listTripPeople } from "@/db/queries/trip-members";
import type { TripWithAccess } from "@/db/queries/trips";
import { InviteLinkPanel } from "./invite-link-panel";
import { LeaveTripButton, RemoveMemberButton } from "./member-buttons";

// 함께하는 사람 칸(#15 설계 §5.4). 이름·사진만 보인다.
// 호출하는 쪽이 이미 getTrip 으로 접근을 확인했다. 쿼리들도 같은 접근 조건을 다시 건다.
export async function MembersSection({
  userId,
  trip,
}: {
  userId: string;
  trip: TripWithAccess;
}) {
  const [people, inviteCreatedAt] = await Promise.all([
    listTripPeople(userId, trip.id),
    trip.isOwner ? getInviteCreatedAt(userId, trip.id) : null,
  ]);
  if (!people) return null;

  return (
    <section
      aria-labelledby="members-heading"
      className="flex flex-col gap-3 rounded-[14px] border border-rule p-4"
    >
      <h2 id="members-heading" className="text-sm font-medium text-sub">
        함께하는 사람
      </h2>
      <ul className="flex flex-col gap-2">
        {people.map((person) => {
          const isMe = person.userId === userId;
          return (
            <li key={person.userId} className="flex items-center gap-3">
              <Avatar name={person.name} image={person.image} />
              <span className="min-w-0 flex-1 break-words">
                {person.name}
                {person.isOwner && (
                  <span className="text-sm text-sub"> · 주인</span>
                )}
                {isMe && <span className="text-sm text-sub"> (나)</span>}
              </span>
              {trip.isOwner && !person.isOwner && (
                <RemoveMemberButton
                  tripId={trip.id}
                  memberUserId={person.userId}
                  name={person.name}
                />
              )}
              {!trip.isOwner && isMe && <LeaveTripButton tripId={trip.id} />}
            </li>
          );
        })}
      </ul>
      {trip.isOwner && (
        <InviteLinkPanel
          tripId={trip.id}
          createdAt={inviteCreatedAt ? inviteCreatedAt.toISOString() : null}
        />
      )}
    </section>
  );
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      // Google 사진 주소는 바뀔 수 있어 next/image 최적화를 거치지 않는다.
      // biome-ignore lint/performance/noImgElement: 외부 프로필 사진
      <img
        src={image}
        alt=""
        width={32}
        height={32}
        referrerPolicy="no-referrer"
        className="size-8 shrink-0 rounded-full"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-sm"
    >
      {name.slice(0, 1)}
    </span>
  );
}
