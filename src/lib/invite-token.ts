// 초대 링크 비밀값(#15). node --test 로 시험하므로 앱 모듈을 import 하지 않는다.
// 원문은 링크에만 있고 DB 에는 SHA-256 hex 만 저장한다(설계 §5.1).
import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// 32바이트 난수 → base64url 43글자.
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// 쿼리 전에 형식이 틀린 값을 거른다.
export function isInviteToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}
