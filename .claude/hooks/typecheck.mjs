#!/usr/bin/env node
// Stop: TS 파일이 바뀐 채로 턴을 끝내려 하면 typecheck 를 돌리고, 실패하면 Claude 에게 되돌립니다 (exit 2).
// schema.ts 만 바뀌고 마이그레이션이 없을 때도 한 번 알려 줍니다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
// 이미 이 훅 때문에 이어서 작업 중이면 다시 막지 않습니다 (무한 루프 방지).
if (input.stop_hook_active) process.exit(0);

const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd, stdio: "pipe", encoding: "utf8" });

let changed = "";
try {
  changed = run("git", ["status", "--porcelain", "--untracked-files=all"]);
} catch {
  process.exit(0);
}
if (!changed.split("\n").some((line) => /\.(m?ts|tsx)$/.test(line.trim())))
  process.exit(0);

// schema.ts 는 바뀌었는데 새 마이그레이션이 없으면 db:generate 를 빼먹었을 수 있습니다.
const lines = changed.split("\n");
const schemaChanged = lines.some((l) => l.trim().endsWith("src/db/schema.ts"));
// 새로 생긴(untracked 또는 staged-added) SQL 만 셉니다. 삭제·수정은 새 마이그레이션이 아닙니다.
const migrationAdded = lines.some((l) =>
  /^(\?\?|A.) drizzle\/.+\.sql$/.test(l),
);
const schemaDrift = schemaChanged && !migrationAdded;

try {
  run("npm", ["run", "--silent", "typecheck"]);
} catch (e) {
  const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
  console.error(
    `typecheck 실패 — 끝내기 전에 고치세요:\n${out.split("\n").slice(-40).join("\n")}`,
  );
  process.exit(2);
}

if (schemaDrift) {
  console.error(
    "src/db/schema.ts 가 바뀌었는데 drizzle/ 에 새 마이그레이션이 없습니다. 테이블·컬럼·인덱스·제약이 바뀌었으면 npm run db:generate 를 돌리세요. 주석이나 타입 export 만 바꾼 것이면 그대로 끝내도 됩니다.",
  );
  process.exit(2);
}
