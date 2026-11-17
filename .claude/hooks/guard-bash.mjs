#!/usr/bin/env node
// PreToolUse(Bash): protect-files.mjs 와 permissions.deny 가 못 잡는 셸 우회 경로를 막습니다.
// exit 2 = 차단, permissionDecision "ask" = 사용자에게 확인.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const cmd = input.tool_input?.command ?? "";
if (!cmd) process.exit(0);

// .env, .env.local, .env.production 과 .env* 같은 glob. 정확히 .env.example 만 허용합니다.
const SECRET =
  /(^|[\s"'=/<>|;&(])\.env(?!\.example(?=$|[\s"';|&<>)]))(?=$|[\s"';|&<>).*?[{])/;
const MIGRATION =
  /(^|[\s"'=/<>|;&(])drizzle(\/[^\s"';|&<>)]*)?(?=$|[\s"';|&<>)])/;
const WRITE =
  /\bsed\b[^|;&]*\s(-[a-zA-Z]*i|--in-place)|\bperl\s+-[a-zA-Z]*i|\b(tee|truncate|mv|cp|dd|install)\b|>>?\s*["']?[^\s"';|&<>]*drizzle\//;
const REMOVE = /\b(rm|unlink|git\s+(rm|clean|checkout|restore))\b/;

// 패턴으로 쓰기를 전부 나열할 수는 없으므로, drizzle/ 을 건드리는 명령은
// 아래 읽기 전용 목록에 있을 때만 그냥 통과시키고 나머지는 사용자에게 묻습니다.
// rg 는 --pre 로 임의 프로그램을 실행할 수 있어 목록에서 뺐습니다.
const READ_ONLY = /^(ls|cat|head|tail|wc|grep|diff|stat|file|echo)$/;
const GIT_SAFE = /^(status|diff|log|show|ls-files|blame|add|commit)$/;
// 읽기 명령도 출력 파일 옵션(git diff --output=…)이 있으면 쓰기가 됩니다.
const OUTPUT_OPTION = /(^|\s)--output\b/;
const isReadOnly = (segment) => {
  // 남아 있는 > 는 파일로 가는 리다이렉션입니다. 따옴표로 경로를 감춰도 여기서 걸립니다.
  if (OUTPUT_OPTION.test(segment) || segment.includes(">")) return false;
  const words = segment.trim().split(/\s+/);
  while (/^\w+=/.test(words[0] ?? "")) words.shift();
  const [bin, sub] = words;
  if (bin === "git") return GIT_SAFE.test(sub ?? "");
  return READ_ONLY.test(bin ?? "");
};

const block = (reason) => {
  console.error(`차단됨: ${reason}`);
  process.exit(2);
};
const ask = (reason) => {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
};

if (SECRET.test(cmd))
  block(
    "셸에서 시크릿 파일(.env*)을 읽거나 쓰지 않습니다. 키 이름은 .env.example 을 보세요.",
  );

if (/\bdrizzle-kit(@\S+)?\s+(push|drop)\b/.test(cmd))
  block(
    "drizzle-kit push/drop 은 쓰지 않습니다. schema.ts 를 고치고 npm run db:generate 를 돌리세요.",
  );

if (MIGRATION.test(cmd)) {
  if (WRITE.test(cmd))
    block(
      "생성된 마이그레이션은 셸로도 고치지 않습니다. schema.ts 를 고치고 npm run db:generate 를 돌리세요.",
    );
  if (REMOVE.test(cmd))
    ask(
      "drizzle/ 아래 마이그레이션을 지우거나 되돌리려 합니다. 아직 적용되지 않은 마이그레이션인지 확인하세요.",
    );
  // 파일을 쓰지 않는 리다이렉션(2>&1, >/dev/null)은 먼저 지웁니다.
  const touching = cmd
    .replace(/\d*>&\d/g, "")
    .replace(/[\d&]*>>?\s*\/dev\/null/g, "")
    .split(/&&|\|\||[;|&\n]/)
    .filter((segment) => MIGRATION.test(segment));
  // 명령 치환·프로세스 치환 안의 명령은 분류하지 않고 보수적으로 묻습니다.
  const nested = /\$\(|`|[<>]\(/.test(cmd);
  if (nested || !touching.every(isReadOnly))
    ask(
      "drizzle/ 를 읽기 전용 목록에 없는 명령으로 건드립니다. 마이그레이션을 바꾸는 명령이 아닌지 확인하세요.",
    );
}
