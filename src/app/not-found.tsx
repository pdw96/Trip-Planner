import Link from "next/link";
import { secondaryButtonClass } from "@/app/ui/styles";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <h1 className="text-2xl font-bold">찾을 수 없는 페이지예요.</h1>
      <p className="text-sub">주소가 잘못되었거나 볼 수 없는 여행이에요.</p>
      <Link href="/trips" className={secondaryButtonClass}>
        내 여행으로
      </Link>
    </main>
  );
}
