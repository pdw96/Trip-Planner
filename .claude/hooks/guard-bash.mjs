#!/usr/bin/env node
// PreToolUse(Bash): protect-files.mjs 와 permissions.deny 가 못 잡는 셸 우회 경로를 막습니다.
// 마이그레이션 적용 전에는 대상 DB 를 보여 주고, 커밋 전에는 lint 를 통과시킵니다.
// exit 2 = 차단, permissionDecision "ask" = 사용자에게 확인.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const cmd = input.tool_input?.command ?? "";
if (!cmd) process.exit(0);
const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// Neon 엔드포인트 id → 브랜치. 엔드포인트가 바뀌면 Neon MCP 의 list_branch_computes 로 확인해 고칩니다.
// 호스트 이름만 담고 있고, 접속에는 비밀번호가 필요하므로 시크릿이 아닙니다.
const KNOWN_ENDPOINTS = {
  "ep-bitter-field-a17osuxw": "Neon main 브랜치 = Vercel 프로덕션 DB",
};

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
// 읽기 명령도 출력 파일 옵션(--output)이나 외부 프로그램을 실행하는 옵션이 있으면 읽기 전용이 아닙니다.
const RISKY_OPTION = /(^|\s)--(output|ext-diff|textconv|exec|pre)\b/;
const isReadOnly = (segment) => {
  // 남아 있는 > 는 파일로 가는 리다이렉션입니다. 따옴표로 경로를 감춰도 여기서 걸립니다.
  if (RISKY_OPTION.test(segment) || segment.includes(">")) return false;
  const words = segment.trim().split(/\s+/);
  // 환경 변수(GIT_EXTERNAL_DIFF, PAGER 등)로 실행할 프로그램을 바꿀 수 있으므로 접두 대입도 묻습니다.
  if (/^\w+=/.test(words[0] ?? "")) return false;
  const [bin, sub] = words;
  if (bin === "git") return GIT_SAFE.test(sub ?? "");
  return READ_ONLY.test(bin ?? "");
};

// drizzle.config.ts 와 같은 순서로 DATABASE_URL 을 찾습니다: dotenv 는 이미 있는 환경 변수를 덮어쓰지 않으므로
// 환경 변수가 먼저, 없으면 .env.local. 비밀번호는 읽기만 하고 호스트만 내보냅니다.
// 명령이 직접 DATABASE_URL 을 바꾸면(`DATABASE_URL=… npm run db:migrate`, `export DATABASE_URL=$X && …`)
// 그 값이 우선입니다. 리터럴 URL 이 아니면 대상을 확인할 수 없다고 알립니다.
const describeDbTarget = () => {
  let raw = process.env.DATABASE_URL;
  let source = "환경 변수";
  const configNote = /(^|\s)--config(=|\s)/.test(cmd)
    ? " (--config 로 다른 설정 파일을 쓰므로 실제 대상은 미확인)"
    : "";
  if (/DATABASE_URL/.test(cmd)) {
    const assigned = [
      ...cmd.matchAll(/\bDATABASE_URL=(["']?)([^\s"']*)\1/g),
    ].at(-1)?.[2];
    if (!assigned || !URL.canParse(assigned))
      return `대상 DB: 명령이 DATABASE_URL 을 바꾸지만 값을 확인할 수 없습니다 (변수·치환·unset 등). 실제 대상은 미확인${configNote}`;
    raw = assigned;
    source = "명령에서 지정";
  }
  if (!raw) {
    try {
      const text = readFileSync(path.join(cwd, ".env.local"), "utf8");
      const m = text.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\s#]+)/m);
      if (m) {
        raw = m[1];
        source = ".env.local";
      }
    } catch {}
  }
  if (!raw)
    return "대상 DB: DATABASE_URL 을 찾지 못했습니다. drizzle-kit 이 연결에 실패할 것입니다";
  let host;
  try {
    host = new URL(raw).hostname;
  } catch {
    return `대상 DB: ${source} 의 DATABASE_URL 을 URL 로 읽지 못했습니다`;
  }
  const endpoint = host.split(".")[0].replace(/-pooler$/, "");
  const label =
    KNOWN_ENDPOINTS[endpoint] ??
    "알 수 없는 엔드포인트 — Neon 콘솔이나 Neon MCP(list_branch_computes)로 어느 브랜치인지 확인하세요";
  return `대상 DB: ${host} (${source}) → ${label}${configNote}`;
};

const latestMigration = () => {
  try {
    const journal = JSON.parse(
      readFileSync(path.join(cwd, "drizzle/meta/_journal.json"), "utf8"),
    );
    return journal.entries?.at(-1)?.tag ?? "없음";
  } catch {
    return "알 수 없음";
  }
};

// 세그먼트가 `git [옵션...] commit` 인지 봅니다. `git log --grep commit` 같은 것은 해당하지 않습니다.
const GIT_OPTION_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree"]);
const isGitCommit = (segment) => {
  const words = segment.trim().split(/\s+/);
  let i = 0;
  while (/^\w+=/.test(words[i] ?? "")) i++;
  if (words[i] !== "git") return false;
  i++;
  while (words[i]?.startsWith("-")) {
    if (GIT_OPTION_WITH_VALUE.has(words[i])) i++;
    i++;
  }
  return words[i] === "commit";
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
    "셸에서 시크릿 파일(.env*)을 읽거나 쓰지 않습니다. 키 이름은 .env.example 을 보세요. 클라우드 세션에서는 값이 환경 변수(예: $DATABASE_URL)로 주입됩니다 — CLAUDE.md '환경' 참고.",
  );

if (/\bdrizzle-kit(@\S+)?\s+(push|drop)\b/.test(cmd))
  block(
    "drizzle-kit push/drop 은 쓰지 않습니다. schema.ts 를 고치고 npm run db:generate 를 돌리세요.",
  );

// 차단(exit 2)을 모두 먼저 판정하고, 확인(ask)은 사유를 모아 맨 끝에서 한 번만 냅니다.
// ask 로 먼저 끝내면 같은 명령에 섞인 차단 대상(예: `sed -i … drizzle/… && npm run db:migrate`)이
// 승인 한 번으로 통과되기 때문입니다.
const asks = [];

// permissions.ask 도 확인을 받지만, 어느 DB 에 적용되는지는 보여 주지 않습니다.
if (
  /\bnpm\s+run(-script)?\s+db:migrate\b|\bdrizzle-kit(@\S+)?\s+migrate\b/.test(
    cmd,
  )
)
  asks.push(
    `마이그레이션을 적용합니다. ${describeDbTarget()}. 최신 마이그레이션: ${latestMigration()}. migration-reviewer 검토를 마쳤는지, 파괴적 변경이면 사용자 확인을 받았는지 보세요.`,
  );

if (MIGRATION.test(cmd)) {
  if (WRITE.test(cmd))
    block(
      "생성된 마이그레이션은 셸로도 고치지 않습니다. schema.ts 를 고치고 npm run db:generate 를 돌리세요.",
    );
  // 파일을 쓰지 않는 리다이렉션(2>&1, >/dev/null)은 먼저 지웁니다.
  const touching = cmd
    .replace(/\d*>&\d/g, "")
    .replace(/[\d&]*>>?\s*\/dev\/null/g, "")
    .split(/&&|\|\||[;|&\n]/)
    .filter((segment) => MIGRATION.test(segment));
  // 명령 치환·프로세스 치환 안의 명령은 분류하지 않고 보수적으로 묻습니다.
  const nested = /\$\(|`|[<>]\(/.test(cmd);
  if (REMOVE.test(cmd))
    asks.push(
      "drizzle/ 아래 마이그레이션을 지우거나 되돌리려 합니다. 아직 적용되지 않은 마이그레이션인지 확인하세요.",
    );
  else if (nested || !touching.every(isReadOnly))
    asks.push(
      "drizzle/ 를 읽기 전용 목록에 없는 명령으로 건드립니다. 마이그레이션을 바꾸는 명령이 아닌지 확인하세요.",
    );
}

// CLAUDE.md: 커밋 전 lint·typecheck 통과. typecheck 는 Stop 훅이, 편집한 파일의 lint 는 format.mjs 가 보지만
// 셸로 바꾼 파일이나 프로젝트 전체 lint 는 여기서 막습니다. 스테이징 전(`git add -A && git commit`)일 수 있어 작업 트리 전체를 봅니다.
if (cmd.split(/&&|\|\||[;|&\n]/).some(isGitCommit)) {
  try {
    execFileSync("npm", ["run", "--silent", "lint"], {
      cwd,
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
    block(
      `커밋 전 npm run lint 가 실패했습니다. 고친 뒤 다시 커밋하세요 (포맷 문제는 npx biome check --write 로 자동 수정).\n${out.split("\n").slice(-30).join("\n")}`,
    );
  }
}

if (asks.length) ask(asks.join(" / "));
