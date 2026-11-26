import Link from "next/link";
import { primaryButtonClass } from "@/app/ui/styles";

// 함께·내 여행 탭의 머리(#122): 제목과 한 줄 설명. "+ 새 여행"은 휴대폰에서만(넓은 화면은 위쪽 머리에 있다).
export function TabPageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        <Link href="/trips/new" className={`${primaryButtonClass} sm:hidden`}>
          + 새 여행
        </Link>
      </div>
      <p className="text-[13.5px] text-sub">{description}</p>
    </header>
  );
}
