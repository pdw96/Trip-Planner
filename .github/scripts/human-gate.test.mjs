import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  approvalMarker,
  decide,
  findApprovalHash,
  isRisky,
  riskyFiles,
  riskyPatchHash,
} from "./human-gate.mjs";

const pick = ({ pass, removeLabel, recordApproval }) => ({
  pass,
  removeLabel,
  recordApproval,
});

// 임시 git 저장소를 만들고, 그 안에서 git 명령과 파일 쓰기를 하는 도우미.
function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "human-gate-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  };
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const lines = (prefix) =>
    `${Array.from({ length: 40 }, (_, i) => `${prefix} ${i}`).join("\n")}\n`;
  git("init", "-q", "-b", "main");
  git("config", "user.name", "test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  write("CLAUDE.md", lines("rule"));
  write("README.md", "readme\n");
  write("src/app/page.tsx", "page\n");
  write("src/lib/session.ts", "session\n");
  write("src/db/index.ts", "db\n");
  commit("base");
  git("checkout", "-q", "-b", "feature");
  return { dir, git, write, commit, lines };
}

// CLAUDE.md 의 n 번째 줄만 바꾼 내용.
const editLine = (lines, n, text) =>
  lines
    .split("\n")
    .map((l, i) => (i === n ? text : l))
    .join("\n");

test("isRisky: 목록의 파일과 접두어는 위험", () => {
  for (const f of [
    "src/db/schema.ts",
    "drizzle/0002_x.sql",
    "drizzle/meta/_journal.json",
    "src/app/api/auth/[...all]/route.ts",
    ".github/workflows/ci.yml",
    ".claude/settings.json",
    "CLAUDE.md",
    "package-lock.json",
    "src/proxy.ts",
  ])
    assert.equal(isRisky(f), true, f);
});

test("isRisky: 비슷한 이름은 위험이 아니다", () => {
  for (const f of [
    "src/lib/authz.ts",
    "drizzle-notes.md",
    "src/app/api/authors/x.ts",
    "docs/.github/x",
    "src/app/page.tsx",
    "docs/CLAUDE.md",
  ])
    assert.equal(isRisky(f), false, f);
});

test("decide: 위험 파일이 없으면 라벨과 무관하게 통과, 아무것도 하지 않는다", () => {
  for (const hasLabel of [true, false])
    assert.deepEqual(
      pick(
        decide({
          risky: [],
          hasLabel,
          labeledNow: hasLabel,
          approvedHash: null,
          currentHash: "h1",
        }),
      ),
      { pass: true, removeLabel: false, recordApproval: false },
    );
});

test("decide: 위험 파일이 있고 라벨이 없으면 실패, 메시지에 파일 목록", () => {
  const r = decide({
    risky: ["CLAUDE.md"],
    hasLabel: false,
    labeledNow: false,
    approvedHash: null,
    currentHash: "h1",
  });
  assert.deepEqual(pick(r), {
    pass: false,
    removeLabel: false,
    recordApproval: false,
  });
  assert.match(r.message, /CLAUDE\.md/);
  assert.match(r.message, /human-approved/);
});

test("decide: 방금 라벨이 붙었으면 지금 상태를 승인으로 기록하고 통과", () => {
  assert.deepEqual(
    pick(
      decide({
        risky: ["CLAUDE.md"],
        hasLabel: true,
        labeledNow: true,
        approvedHash: "old",
        currentHash: "h1",
      }),
    ),
    { pass: true, removeLabel: false, recordApproval: true },
  );
});

test("decide: 라벨이 있고 승인 기록과 지금이 같으면 통과", () => {
  assert.deepEqual(
    pick(
      decide({
        risky: ["CLAUDE.md"],
        hasLabel: true,
        labeledNow: false,
        approvedHash: "h1",
        currentHash: "h1",
      }),
    ),
    { pass: true, removeLabel: false, recordApproval: false },
  );
});

test("decide: 라벨이 있지만 승인 기록과 다르면 실패 + 라벨 제거", () => {
  const r = decide({
    risky: ["CLAUDE.md"],
    hasLabel: true,
    labeledNow: false,
    approvedHash: "h0",
    currentHash: "h1",
  });
  assert.deepEqual(pick(r), {
    pass: false,
    removeLabel: true,
    recordApproval: false,
  });
  assert.match(r.message, /승인을 해제/);
});

test("decide: 라벨이 있지만 승인 기록이 아직 없으면 실패하되 라벨은 남긴다 (labeled 실행이 기록할 수 있게)", () => {
  const r = decide({
    risky: ["CLAUDE.md"],
    hasLabel: true,
    labeledNow: false,
    approvedHash: null,
    currentHash: "h1",
  });
  assert.deepEqual(pick(r), {
    pass: false,
    removeLabel: false,
    recordApproval: false,
  });
  assert.match(r.message, /다시 붙이세요/);
});

test("riskyFiles: 한글 등 non-ASCII 위험 파일명도 센다", () => {
  const { dir, write, commit } = makeRepo();
  write(".github/workflows/승인.yml", "on: push\n");
  write("drizzle/0003_한글.sql", "select 1;\n");
  commit("non-ascii risky files");
  assert.deepEqual(riskyFiles("main", "HEAD", dir).sort(), [
    ".github/workflows/승인.yml",
    "drizzle/0003_한글.sql",
  ]);
});

test("riskyPatchHash: 같은 줄 변경이라도 위치(주변 코드)가 다르면 다르다", () => {
  const { dir, git, write, commit } = makeRepo();
  const src = (displayRet, authRet) =>
    [
      "export function display() {",
      "  const label = 'x';",
      `  return ${displayRet};`,
      "}",
      "",
      "// spacer 1",
      "// spacer 2",
      "// spacer 3",
      "// spacer 4",
      "",
      "export function authorize() {",
      "  const role = 'y';",
      `  return ${authRet};`,
      "}",
      "",
    ].join("\n");
  git("checkout", "-q", "main");
  write("src/lib/auth.ts", src("false", "false"));
  commit("base auth");
  git("checkout", "-q", "-B", "feature");
  write("src/lib/auth.ts", src("true", "false"));
  const approved = commit("display returns true");
  write("src/lib/auth.ts", src("false", "true"));
  commit("move the change into authorize");
  assert.notEqual(
    riskyPatchHash("main", "HEAD", dir),
    riskyPatchHash("main", approved, dir),
  );
});

test("findApprovalHash: github-actions[bot] 의 마지막 기록만 읽는다", () => {
  const bot = { login: "github-actions[bot]" };
  const comments = [
    { user: bot, body: approvalMarker("a0") },
    { user: { login: "pdw96" }, body: "평범한 코멘트" },
    { user: bot, body: `승인 기록\n${approvalMarker("b1")}` },
    { user: { login: "pdw96" }, body: approvalMarker("cc") },
  ];
  assert.equal(findApprovalHash(comments), "b1");
  assert.equal(findApprovalHash([]), null);
});

test("riskyFiles: rename 의 옛 경로와 삭제도 센다", () => {
  const { dir, git, commit } = makeRepo();
  git("mv", "src/lib/session.ts", "src/lib/sess.ts");
  git("rm", "-q", "src/db/index.ts");
  commit("rename and delete");
  assert.deepEqual(riskyFiles("main", "HEAD", dir).sort(), [
    "src/db/index.ts",
    "src/lib/session.ts",
  ]);
});

test("riskyPatchHash: main 병합만으로는 바뀌지 않는다", () => {
  const { dir, git, write, commit, lines } = makeRepo();
  write("CLAUDE.md", editLine(lines("rule"), 30, "branch edit"));
  const approved = commit("branch edits CLAUDE.md");
  git("checkout", "-q", "main");
  write("README.md", "readme v2\n");
  commit("main edits README");
  git("checkout", "-q", "feature");
  git("merge", "-q", "--no-edit", "main");
  assert.equal(
    riskyPatchHash("main", "HEAD", dir),
    riskyPatchHash("main", approved, dir),
  );
});

test("riskyPatchHash: main 이 같은 위험 파일의 다른 줄을 고친 뒤 병합해도 바뀌지 않는다", () => {
  const { dir, git, write, commit, lines } = makeRepo();
  write("CLAUDE.md", editLine(lines("rule"), 30, "branch edit"));
  const approved = commit("branch edits line 30");
  git("checkout", "-q", "main");
  write("CLAUDE.md", editLine(lines("rule"), 2, "main edit"));
  commit("main edits line 2");
  git("checkout", "-q", "feature");
  git("merge", "-q", "--no-edit", "main");
  assert.equal(
    riskyPatchHash("main", "HEAD", dir),
    riskyPatchHash("main", approved, dir),
  );
});

test("riskyPatchHash: 승인 뒤 위험 변경 → 안전한 변경 순서여도 승인 때와 다르다", () => {
  const { dir, write, commit, lines } = makeRepo();
  write("CLAUDE.md", editLine(lines("rule"), 30, "approved edit"));
  const approved = commit("approved state");
  write("src/lib/session.ts", "session v2\n");
  commit("risky change after approval");
  write("src/app/page.tsx", "page v2\n");
  commit("safe change on top");
  assert.notEqual(
    riskyPatchHash("main", "HEAD", dir),
    riskyPatchHash("main", approved, dir),
  );
});

test("riskyPatchHash: 브랜치가 안전한 파일만 고치면 바뀌지 않는다", () => {
  const { dir, write, commit, lines } = makeRepo();
  write("CLAUDE.md", editLine(lines("rule"), 30, "approved edit"));
  const approved = commit("approved state");
  write("src/app/page.tsx", "page v2\n");
  commit("safe edit");
  assert.equal(
    riskyPatchHash("main", "HEAD", dir),
    riskyPatchHash("main", approved, dir),
  );
});
