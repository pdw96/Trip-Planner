import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { secondaryButtonClass } from "@/app/ui/styles";
import { findInvite } from "@/db/queries/trip-members";
import { getTrip } from "@/db/queries/trips";
import { hashInviteToken, isInviteToken } from "@/lib/invite-token";
import { getCurrentUser } from "@/lib/session";
import { formatLongRange } from "@/lib/trip-dates";
import { GoogleSignInButton } from "../../auth-buttons";
import { InAppBrowserNotice } from "../../in-app-browser-notice";
import { INVITE_INVALID } from "../../trips/messages";
import { JoinButton } from "./join-button";

// 초대 화면(#15 설계 §5.3 의 3). 그리기만 해서는 아무것도 쓰지 않는다(미리 불러오기로 참여되지 않게).
// 비밀값이 주소에 있으므로 Referer 로 내보내지 않고, 외부 스크립트를 불러오지 않는다.
export const metadata: Metadata = {
  title: "여행 초대",
  referrer: "no-referrer",
};

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Trip Planner</h1>
      <Suspense fallback={<p className="text-sub">불러오는 중…</p>}>
        <Invite params={params} />
      </Suspense>
    </main>
  );
}

async function Invite({
  params,
}: {
  params: PageProps<"/invite/[token]">["params"];
}) {
  const { token } = await params;
  if (!isInviteToken(token)) return <InvalidInvite signedIn={false} />;

  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <p className="text-sub">초대받은 여행에 참여하려면 로그인하세요.</p>
        <InAppBrowserNotice />
        <GoogleSignInButton callbackURL={`/invite/${token}`} />
      </>
    );
  }

  const invite = await findInvite(hashInviteToken(token));
  if (!invite) return <InvalidInvite signedIn />;
  if (await getTrip(user.id, invite.tripId)) {
    redirect(`/trips/${invite.tripId}`);
  }

  return (
    <>
      <p className="max-w-md break-words text-lg">
        {invite.ownerName}님의 ‘{invite.title}’ 여행
        <span className="block text-base text-sub">
          {formatLongRange(invite.startDate, invite.endDate)}
        </span>
      </p>
      <p className="text-sub">함께할까요?</p>
      <JoinButton token={token} />
    </>
  );
}

function InvalidInvite({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <p className="max-w-md text-sub">{INVITE_INVALID}</p>
      <Link href={signedIn ? "/trips" : "/"} className={secondaryButtonClass}>
        {signedIn ? "내 여행으로" : "처음으로"}
      </Link>
    </>
  );
}
