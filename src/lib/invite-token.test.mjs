import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateInviteToken,
  hashInviteToken,
  isInviteToken,
} from "./invite-token.ts";

test("generateInviteToken makes distinct 43-char tokens that pass the format check", () => {
  const a = generateInviteToken();
  const b = generateInviteToken();
  assert.notEqual(a, b);
  assert.equal(a.length, 43);
  assert.equal(isInviteToken(a), true);
  assert.equal(isInviteToken(b), true);
});

test("hashInviteToken is SHA-256 hex", () => {
  assert.equal(
    hashInviteToken("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(hashInviteToken("abc"), hashInviteToken("abc"));
});

test("isInviteToken rejects wrong length and characters", () => {
  for (const bad of [
    "",
    "a".repeat(42),
    "a".repeat(44),
    `${"a".repeat(42)}/`,
    `${"a".repeat(40)}%2F`,
    `${"a".repeat(42)}=`,
  ]) {
    assert.equal(isInviteToken(bad), false, bad);
  }
  assert.equal(isInviteToken(`${"A".repeat(20)}-_${"9".repeat(21)}`), true);
});
