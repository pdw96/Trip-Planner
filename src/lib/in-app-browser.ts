// 앱 안 브라우저 판별(#15 설계 §5.7). Google 은 앱 안 브라우저에서 로그인을 거부한다(disallowed_useragent).
// node --test 로 시험하므로 다른 모듈을 import 하지 않는다. 판별 문자열은 앱 업데이트로 바뀔 수 있다.

export type InAppBrowser = "kakaotalk" | "other" | null;

const KAKAOTALK = /KAKAOTALK/i;
// 인스타그램, 페이스북, 라인, 네이버 앱, 안드로이드 웹뷰
const OTHER_IN_APP = /Instagram|FBAN|FBAV|\bLine\/|NAVER\(inapp|; wv\)/i;

export function detectInAppBrowser(userAgent: string): InAppBrowser {
  if (KAKAOTALK.test(userAgent)) return "kakaotalk";
  if (OTHER_IN_APP.test(userAgent)) return "other";
  return null;
}

// 카톡이 지원하는 "바깥 브라우저로 열기" 주소.
export function kakaoOpenExternalUrl(href: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
}
