import assert from "node:assert/strict";
import { test } from "node:test";
import { isUuid } from "./ids.ts";

test("accepts a uuid", () => {
  assert.equal(isUuid("3f2b8c1e-9a4d-4e2b-8f1a-0c9d8e7f6a5b"), true);
  assert.equal(isUuid("3F2B8C1E-9A4D-4E2B-8F1A-0C9D8E7F6A5B"), true);
});

test("rejects anything that is not a uuid", () => {
  for (const value of [
    "",
    "abc",
    "3f2b8c1e9a4d4e2b8f1a0c9d8e7f6a5b",
    "3f2b8c1e-9a4d-4e2b-8f1a-0c9d8e7f6a5bx",
    " 3f2b8c1e-9a4d-4e2b-8f1a-0c9d8e7f6a5b",
    "3f2b8c1e-9a4d-4e2b-8f1a-0c9d8e7f6a5g",
  ]) {
    assert.equal(isUuid(value), false, value);
  }
});
