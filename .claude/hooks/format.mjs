#!/usr/bin/env node
// PostToolUse: 편집한 파일에 Biome 포맷 + 안전한 린트 수정을 적용합니다. 실패해도 작업은 막지 않습니다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = input.tool_input?.file_path ?? "";
if (!/\.(m?[jt]sx?|json|jsonc|css)$/.test(file) || !existsSync(file))
  process.exit(0);

try {
  execFileSync(
    "npx",
    ["biome", "check", "--write", "--no-errors-on-unmatched", file],
    {
      cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
      stdio: "pipe",
    },
  );
} catch (e) {
  // 자동으로 못 고친 린트 오류는 Claude 에게 알려 줍니다.
  // PostToolUse 에서 stderr 는 exit 2 일 때만 Claude 에게 전달됩니다 (편집은 이미 적용됐으므로 되돌려지지 않음).
  const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
  if (out) {
    console.error(out.split("\n").slice(-30).join("\n"));
    process.exit(2);
  }
}
