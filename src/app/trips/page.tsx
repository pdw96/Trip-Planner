import { redirect } from "next/navigation";

// 옛 목록 주소. 목록은 탭 화면(홈 · 함께 · 내 여행, #122)으로 나뉘었다. 북마크가 깨지지 않게 홈으로 보낸다.
export default function TripsPage() {
  redirect("/");
}
