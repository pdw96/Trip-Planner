"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SignOutButton } from "@/app/auth-buttons";
import { AppName } from "@/app/ui/app-name";
import { primaryButtonClass } from "@/app/ui/styles";

// 주 메뉴(#122): 휴대폰에서는 화면 아래 탭 막대, 넓은 화면(sm 이상)에서는 위쪽 머리 한 줄.
// 현재 칸을 고르는 데 주소가 필요해서 이것만 클라이언트 컴포넌트다.

const TABS: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/",
    label: "홈",
    icon: (
      <path
        d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/together",
    label: "함께",
    icon: (
      <g strokeLinecap="round">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M16.5 14.6c2.4.3 4.2 2.1 4.9 5.4" />
      </g>
    ),
  },
  {
    href: "/mine",
    label: "내 여행",
    icon: (
      <g strokeLinejoin="round">
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
        <path d="M5 17a3 3 0 0 1 3-3h11" />
      </g>
    ),
  },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar({ placement }: { placement: "top" | "bottom" }) {
  const pathname = usePathname();

  if (placement === "bottom") {
    // body(min-h-full flex-col)의 마지막 자식이라 sticky 로 화면 아래에 붙고 본문을 가리지 않는다.
    return (
      <nav
        aria-label="주 메뉴"
        className="sticky bottom-0 z-30 grid grid-cols-3 border-t border-rule bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {TABS.map((tab) => {
          const current = isCurrent(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${current ? "font-bold text-foreground" : "font-medium text-sub"}`}
            >
              <svg
                aria-hidden
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={current ? 2 : 1.8}
              >
                {tab.icon}
              </svg>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <header className="hidden border-b border-rule sm:block">
      <div className="mx-auto flex min-h-16 w-full max-w-2xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          <AppName />
          <nav aria-label="주 메뉴" className="flex gap-1">
            {TABS.map((tab) => {
              const current = isCurrent(pathname, tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={current ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center px-3 text-sm ${current ? "font-bold text-foreground shadow-[inset_0_-2px_0_var(--foreground)]" : "font-medium text-sub hover:text-foreground"}`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/trips/new" className={primaryButtonClass}>
            + 새 여행
          </Link>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
