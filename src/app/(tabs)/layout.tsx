import { type ReactNode, Suspense } from "react";
import { getCurrentUser } from "@/lib/session";
import { TabBar } from "./tab-bar";
import { TripLinkMarker } from "./trip-link-marker";

// 탭 화면(홈 `/` · 함께 `/together` · 내 여행 `/mine`)만 묶은 틀(#122). 여행 화면·새 여행·초대는 이 묶음 밖이라 탭이 없다.
// 감싸는 요소 없이 돌려준다: 페이지의 main(flex-1)과 아래 탭 막대(sticky)가 body(flex-col)의 바로 아래 자식이어야 한다.
// 로그인하지 않은 `/`(로그인 화면)에서는 탭을 그리지 않는다.
export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <TabNav placement="top" />
      </Suspense>
      {children}
      <Suspense fallback={null}>
        <TabNav placement="bottom" />
      </Suspense>
    </>
  );
}

async function TabNav({ placement }: { placement: "top" | "bottom" }) {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <>
      {placement === "bottom" && <TripLinkMarker />}
      <TabBar placement={placement} />
    </>
  );
}
