import { getInviteCreatedAt, listTripPeople } from "@/db/queries/trip-members";
import type { TripWithAccess } from "@/db/queries/trips";
import { InviteLinkPanel } from "./invite-link-panel";
import { LeaveTripButton, RemoveMemberButton } from "./member-buttons";

// 함께하는 사람 칸(#15 설계 §5.4). 이름·사진만 보인다.
const MAX_FACES = 5;
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

  const shown = people.slice(0, MAX_FACES);
  const solo = people.length === 1;

  // 기본은 사진 겹침 + 이름들 한 줄로 접는다(#53 설계 §5.4 3). 클라이언트 JS 없이 <details> 로 연다.
  // 펼친 상태는 서버가 다시 그려도(링크 만들기 등) 브라우저가 유지한다.
  return (
    <section aria-labelledby="members-heading">
      <h2 id="members-heading" className="sr-only">
        함께하는 사람
      </h2>
      <details className="group">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-[10px] [&::-webkit-details-marker]:hidden">
          <span className="flex shrink-0 -space-x-2">
            {shown.map((person) => (
              <Avatar
                key={person.userId}
                name={person.name}
                image={person.image}
                ringed
              />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">
            {people.map((person) => person.name).join(", ")}
            {solo && trip.isOwner && (
              <span className="text-sub"> · 함께할 사람 초대</span>
            )}
          </span>
          <span
            aria-hidden
            className="shrink-0 text-sub transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
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
                  {!trip.isOwner && isMe && (
                    <LeaveTripButton tripId={trip.id} />
                  )}
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
        </div>
      </details>
    </section>
  );
}

function Avatar({
  name,
  image,
  ringed = false,
}: {
  name: string;
  image: string | null;
  // 겹친 사진 사이를 바탕색 고리로 가른다.
  ringed?: boolean;
}) {
  const ring = ringed ? "ring-2 ring-background" : "";
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
        className={`size-8 shrink-0 rounded-full ${ring}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-sm ${ring}`}
    >
      {name.slice(0, 1)}
    </span>
  );
}
