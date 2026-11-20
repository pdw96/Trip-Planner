import assert from "node:assert/strict";
import { test } from "node:test";
import { detectInAppBrowser, kakaoOpenExternalUrl } from "./in-app-browser.ts";

const KAKAO_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5";
const KAKAO_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S911N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36;KAKAOTALK 2410450";

test("detectInAppBrowser finds KakaoTalk on iOS and Android", () => {
  assert.equal(detectInAppBrowser(KAKAO_IOS), "kakaotalk");
  assert.equal(detectInAppBrowser(KAKAO_ANDROID), "kakaotalk");
});

test("detectInAppBrowser marks other in-app browsers", () => {
  for (const ua of [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]",
    "Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36 FBAV/450.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 Safari Line/13.1.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 NAVER(inapp; search; 1000; 12.0.0)",
    "Mozilla/5.0 (Linux; Android 14; SM-S911N; wv) AppleWebKit/537.36 Version/4.0 Chrome/120.0 Mobile Safari/537.36",
  ]) {
    assert.equal(detectInAppBrowser(ua), "other", ua);
  }
});

test("detectInAppBrowser leaves ordinary browsers alone", () => {
  for (const ua of [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
    "",
  ]) {
    assert.equal(detectInAppBrowser(ua), null, ua);
  }
});

test("kakaoOpenExternalUrl encodes the page address", () => {
  assert.equal(
    kakaoOpenExternalUrl("https://x.test/invite/a?b=1"),
    "kakaotalk://web/openExternal?url=https%3A%2F%2Fx.test%2Finvite%2Fa%3Fb%3D1",
  );
});
