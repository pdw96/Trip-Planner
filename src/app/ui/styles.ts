// 모든 화면이 같이 쓰는 버튼·입력칸·카드·문구 스타일(#53 설계 §5.3). 색은 globals.css 의 토큰만 쓴다.
// 입력칸 기본 클래스(fieldClass)에는 폭을 넣지 않는다. 폭은 쓰는 쪽이 늘 붙인다(w-full, w-32, flex-1 …).
// 폭을 합친 상수를 두면 생성된 CSS 순서 때문에 다른 폭 클래스를 이겨 버린다(#52: 금액 칸이 0 폭).

const button =
  "inline-flex shrink-0 items-center justify-center rounded-[10px] font-semibold transition-colors disabled:opacity-50";
const regular = "h-10 px-4 text-sm";
const small = "h-8 px-3 text-[13px]";

export const primaryButtonClass = `${button} ${regular} bg-foreground text-on-ink hover:opacity-85`;

export const secondaryButtonClass = `${button} ${regular} border border-field-line hover:bg-surface`;

export const dangerButtonClass = `${button} ${regular} border border-danger/45 text-danger hover:bg-danger/10`;

// 테두리 없는 글자 버튼("일정 넣기", "취소" 같은 곳).
export const quietButtonClass = `${button} ${regular} text-sub hover:bg-surface hover:text-foreground`;

// 같은 버튼을 높이 32px 로. 덧붙이면 h-10·h-8 이 충돌하므로 크기 부분을 바꿔 끼운다.
export function smallButton(cls: string): string {
  return cls.replace(regular, small);
}

export const fieldClass =
  "h-[42px] rounded-[10px] border border-field-line bg-field px-3 text-[15px] aria-[invalid=true]:border-danger";

// 여러 줄 칸(textarea). 높이 대신 위아래 여백.
export const fieldAreaClass =
  "rounded-[10px] border border-field-line bg-field px-3 py-2.5 text-[15px] aria-[invalid=true]:border-danger";

export const cardClass = "rounded-[14px] bg-surface p-4";

export const errorTextClass = "text-[13px] text-danger";

export const emptyStateClass =
  "flex flex-col items-start gap-2.5 rounded-[14px] border border-dashed border-field-line p-4";

export const sectionTitleClass = "text-lg font-bold";

export const subTitleClass = "text-[13px] font-semibold text-sub";
