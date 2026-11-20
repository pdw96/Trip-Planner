// 여행 화면들이 같이 쓰는 버튼 스타일. 홈의 로그인 버튼(auth-buttons.tsx)과 같은 모양이다.

const base =
  "inline-flex h-11 items-center justify-center rounded-full px-5 font-medium transition-colors disabled:opacity-50";

export const primaryButtonClass = `${base} bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc]`;

export const secondaryButtonClass = `${base} border border-solid border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]`;

// 양식 입력칸. aria-invalid 이면 빨간 테두리.
// 폭을 따로 정하는 칸(w-auto·w-32·flex-1 등)은 inputBaseClass 를 쓴다. inputClass 의 w-full 은 생성된 CSS 에서
// 다른 폭 클래스보다 뒤에 와서 늘 이긴다(#14: 통화 고르기가 카드 밖으로 넘치고 금액 칸이 0 폭이 됨).
export const inputBaseClass =
  "rounded-xl border border-black/[.15] bg-transparent px-4 py-2.5 aria-[invalid=true]:border-red-600 dark:border-white/[.2]";

export const inputClass = `w-full ${inputBaseClass}`;

export const dangerButtonClass = `${base} border border-solid border-red-600/40 text-red-600 hover:bg-red-600/10`;
