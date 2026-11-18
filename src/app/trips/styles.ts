// 여행 화면들이 같이 쓰는 버튼 스타일. 홈의 로그인 버튼(auth-buttons.tsx)과 같은 모양이다.

const base =
  "inline-flex h-11 items-center justify-center rounded-full px-5 font-medium transition-colors disabled:opacity-50";

export const primaryButtonClass = `${base} bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc]`;

export const secondaryButtonClass = `${base} border border-solid border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]`;

export const dangerButtonClass = `${base} border border-solid border-red-600/40 text-red-600 hover:bg-red-600/10`;
