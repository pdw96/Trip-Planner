#!/usr/bin/env node
// PreToolUse: 시크릿 · lock 파일 · 이미 생성된 마이그레이션 편집을 막습니다 (exit 2 = 차단).
import { readFileSync } from "node:fs";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const file =
  input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "";
const rel = path.relative(
  process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  file,
);
const base = path.basename(file);

const rules = [
  [
    /^\.env(\..+)?$/.test(base) && base !== ".env.example",
    "시크릿 파일(.env*)은 직접 편집하지 않습니다. .env.example 을 고치세요.",
  ],
  [
    ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(base),
    "lock 파일은 npm install 로만 바꿉니다.",
  ],
  [
    /^drizzle[\\/].+\.(sql|json)$/.test(rel),
    "생성된 마이그레이션은 손으로 고치지 않습니다. schema.ts 를 고치고 npm run db:generate 를 돌리세요.",
  ],
];

for (const [hit, reason] of rules) {
  if (hit) {
    console.error(`차단됨: ${rel} — ${reason}`);
    process.exit(2);
  }
}
