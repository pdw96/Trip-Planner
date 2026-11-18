import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        찾을 수 없는 페이지예요.
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        주소가 잘못되었거나 볼 수 없는 여행이에요.
      </p>
      <Link
        href="/trips"
        className="flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        내 여행으로
      </Link>
    </main>
  );
}
