#!/usr/bin/env node
// Stop: TS 파일이 바뀐 채로 턴을 끝내려 하면 typecheck 를 돌리고, 실패하면 Claude 에게 되돌립니다 (exit 2).
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

try {
  run("npm", ["run", "--silent", "typecheck"]);
} catch (e) {
  const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
  console.error(
    `typecheck 실패 — 끝내기 전에 고치세요:\n${out.split("\n").slice(-40).join("\n")}`,
  );
  process.exit(2);
}
