// 아래에서 올라오는 <dialog> 판(예산 시트·[+ 지출] 시트)이 함께 쓰는 것(#97).

// 바탕(가림막) 위의 누르기인지. dialog 가 스크롤 영역이라 자기 스크롤바를 눌러도 target 이 dialog 이므로 좌표로도 본다.
export function isOnBackdrop(event: {
  target: EventTarget;
  currentTarget: EventTarget & Element;
  clientX: number;
  clientY: number;
}): boolean {
  if (event.target !== event.currentTarget) return false;
  const r = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < r.left ||
    event.clientX > r.right ||
    event.clientY < r.top ||
    event.clientY > r.bottom
  );
}

// 판이 열린 동안 뒤 페이지 스크롤을 막는다(showModal 은 뒤를 inert 로만 만들고 스크롤은 막지 않는다).
// 스크롤바 자리는 남겨 두어 화면이 옆으로 들썩이지 않게 한다. 되돌리는 함수를 돌려준다.
export function lockPageScroll(): () => void {
  const style = document.documentElement.style;
  const before = { overflow: style.overflow, gutter: style.scrollbarGutter };
  style.overflow = "hidden";
  style.scrollbarGutter = "stable";
  return () => {
    style.overflow = before.overflow;
    style.scrollbarGutter = before.gutter;
  };
}
