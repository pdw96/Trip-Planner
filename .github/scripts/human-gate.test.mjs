import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  decide,
  isRisky,
  riskyChangedSince,
  riskyFiles,
} from "./human-gate.mjs";

const pick = ({ pass, removeLabel }) => ({ pass, removeLabel });

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
  git("init", "-q", "-b", "main");
  git("config", "user.name", "test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  write("CLAUDE.md", "rules\n");
  write("README.md", "readme\n");
  write("src/app/page.tsx", "page\n");
  write("src/lib/session.ts", "session\n");
  write("src/db/index.ts", "db\n");
  commit("base");
  git("checkout", "-q", "-b", "feature");
  return { dir, git, write, commit };
}

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

test("decide: 위험 파일이 없으면 라벨과 무관하게 통과", () => {
  for (const hasLabel of [true, false])
    assert.deepEqual(
      pick(decide({ risky: [], hasLabel, changedSinceApproval: true })),
      { pass: true, removeLabel: false },
    );
});

test("decide: 위험 파일이 있고 라벨이 없으면 실패, 메시지에 파일 목록", () => {
  const r = decide({
    risky: ["CLAUDE.md"],
    hasLabel: false,
    changedSinceApproval: false,
  });
  assert.equal(r.pass, false);
  assert.equal(r.removeLabel, false);
  assert.match(r.message, /CLAUDE\.md/);
  assert.match(r.message, /human-approved/);
});

test("decide: 라벨 있고 승인 뒤 위험 변경 없음 → 통과", () => {
  assert.deepEqual(
    pick(
      decide({
        risky: ["CLAUDE.md"],
        hasLabel: true,
        changedSinceApproval: false,
      }),
    ),
    { pass: true, removeLabel: false },
  );
});

test("decide: 라벨 있지만 승인 뒤 위험 변경 → 실패 + 라벨 제거", () => {
  const r = decide({
    risky: ["CLAUDE.md"],
    hasLabel: true,
    changedSinceApproval: true,
  });
  assert.deepEqual(pick(r), { pass: false, removeLabel: true });
  assert.match(r.message, /승인을 해제/);
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

test("riskyPatch: main 병합만으로는 바뀌지 않는다", () => {
  const { dir, git, write, commit } = makeRepo();
  write("CLAUDE.md", "rules v2\n");
  const before = commit("branch edits CLAUDE.md");
  git("checkout", "-q", "main");
  write("README.md", "readme v2\n");
  commit("main edits README");
  git("checkout", "-q", "feature");
  git("merge", "-q", "--no-edit", "main");
  const after = git("rev-parse", "HEAD");
  assert.equal(riskyChangedSince("main", before, after, dir), false);
});

test("riskyChangedSince: 브랜치가 위험 파일을 다시 고치면 true", () => {
  const { dir, write, commit } = makeRepo();
  write("CLAUDE.md", "rules v2\n");
  const before = commit("approved state");
  write("CLAUDE.md", "rules v3\n");
  const after = commit("edit again");
  assert.equal(riskyChangedSince("main", before, after, dir), true);
});

test("riskyChangedSince: 브랜치가 안전한 파일만 고치면 false", () => {
  const { dir, write, commit } = makeRepo();
  write("CLAUDE.md", "rules v2\n");
  const before = commit("approved state");
  write("src/app/page.tsx", "page v2\n");
  const after = commit("safe edit");
  assert.equal(riskyChangedSince("main", before, after, dir), false);
});

test("riskyChangedSince: before 커밋이 없으면 바뀐 것으로 본다", () => {
  const { dir, write, commit } = makeRepo();
  write("CLAUDE.md", "rules v2\n");
  commit("approved state");
  assert.equal(riskyChangedSince("main", "0".repeat(40), "HEAD", dir), true);
});
