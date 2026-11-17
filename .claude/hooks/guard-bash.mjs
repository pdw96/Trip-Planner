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
  /\b(sed\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*i|perl\s+-[a-zA-Z]*i|tee|truncate|mv|cp|dd|install)\b|>>?\s*["']?[^\s"';|&<>]*drizzle\//;
const REMOVE = /\b(rm|unlink|git\s+(rm|clean|checkout|restore))\b/;

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

if (/\bdrizzle-kit\s+(push|drop)\b/.test(cmd))
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
}
