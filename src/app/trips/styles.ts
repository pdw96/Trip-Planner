// 여행 화면들이 같이 쓰는 버튼 스타일. 홈의 로그인 버튼(auth-buttons.tsx)과 같은 모양이다.

const base =
  "inline-flex h-11 items-center justify-center rounded-full px-5 font-medium transition-colors disabled:opacity-50";

export const primaryButtonClass = `${base} bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc]`;

export const secondaryButtonClass = `${base} border border-solid border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]`;

// 양식 입력칸. aria-invalid 이면 빨간 테두리.
export const inputClass =
  "w-full rounded-xl border border-black/[.15] bg-transparent px-4 py-2.5 aria-[invalid=true]:border-red-600 dark:border-white/[.2]";

export const dangerButtonClass = `${base} border border-solid border-red-600/40 text-red-600 hover:bg-red-600/10`;
