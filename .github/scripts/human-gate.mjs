#!/usr/bin/env node
// human-gate: 위험 경로를 건드린 PR 은 사람이 `human-approved` 라벨을 붙여야 통과한다.
// 설계: docs/superpowers/specs/2026-11-17-ai-native-workflow-design.md (6.4)
// 이 파일의 목록이 위험 경로의 기준이다. CLAUDE.md 의 목록은 이것을 옮긴 것이다.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LABEL = "human-approved";

export const RISKY_FILES = Object.freeze([
  "src/db/schema.ts",
  "src/db/index.ts",
  "drizzle.config.ts",
  "src/lib/auth.ts",
  "src/lib/auth-client.ts",
  "src/lib/session.ts",
  "next.config.ts",
  ".env.example",
  "package.json",
  "package-lock.json",
  "vercel.json",
  "proxy.ts",
  "src/proxy.ts",
  "CLAUDE.md",
  "AGENTS.md",
  ".mcp.json",
  "biome.json",
  "tsconfig.json",
]);

export const RISKY_PREFIXES = Object.freeze([
  "drizzle/",
  "src/app/api/auth/",
  ".github/",
  ".claude/",
]);

export function isRisky(file) {
  return (
    RISKY_FILES.includes(file) ||
    RISKY_PREFIXES.some((prefix) => file.startsWith(prefix))
  );
}

const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 << 20 });

const mergeBase = (baseRef, sha, cwd) =>
  git(["merge-base", baseRef, sha], cwd).trim();

// PR 쪽에서 바뀐 위험 파일. rename 은 옛 경로와 새 경로를 모두 센다(--no-renames).
export function riskyFiles(baseRef, headSha, cwd) {
  const base = mergeBase(baseRef, headSha, cwd);
  return git(["diff", "--name-only", "--no-renames", base, headSha], cwd)
    .split("\n")
    .filter(Boolean)
    .filter(isRisky);
}

// PR 쪽 위험 변경의 내용. main 을 병합해도 merge-base 기준이라 PR 쪽 변경만 남는다.
export function riskyPatch(baseRef, sha, cwd) {
  const files = riskyFiles(baseRef, sha, cwd);
  if (files.length === 0) return "";
  const base = mergeBase(baseRef, sha, cwd);
  return git(["diff", "--no-renames", base, sha, "--", ...files], cwd);
}

// 비교할 수 없으면(force-push 로 before 가 사라짐 등) 바뀐 것으로 본다.
export function riskyChangedSince(baseRef, beforeSha, afterSha, cwd) {
  try {
    return (
      riskyPatch(baseRef, beforeSha, cwd) !== riskyPatch(baseRef, afterSha, cwd)
    );
  } catch {
    return true;
  }
}

export function decide({ risky, hasLabel, changedSinceApproval }) {
  if (risky.length === 0)
    return {
      pass: true,
      removeLabel: false,
      message: "위험 경로를 건드리지 않았습니다. 사람 승인이 필요 없습니다.",
    };
  const list = risky.map((f) => `- ${f}`).join("\n");
  if (hasLabel && changedSinceApproval)
    return {
      pass: false,
      removeLabel: true,
      message: `승인 이후 위험 경로가 다시 바뀌어 승인을 해제했습니다. 다시 확인한 뒤 \`${LABEL}\` 라벨을 붙이세요.\n\n${list}`,
    };
  if (hasLabel)
    return {
      pass: true,
      removeLabel: false,
      message: `\`${LABEL}\` 라벨로 승인된 위험 경로 변경입니다.\n\n${list}`,
    };
  return {
    pass: false,
    removeLabel: false,
    message: `위험 경로를 건드렸습니다. 사람이 확인한 뒤 \`${LABEL}\` 라벨을 붙이세요.\n\n${list}`,
  };
}

async function removeLabel(number) {
  const { GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env;
  const res = await fetch(
    `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/issues/${number}/labels/${LABEL}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (!res.ok && res.status !== 404)
    throw new Error(`라벨 제거 실패: HTTP ${res.status}`);
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const pr = event.pull_request;
  const baseRef = `origin/${pr.base.ref}`;
  const hasLabel = pr.labels.some((l) => l.name === LABEL);
  const risky = riskyFiles(baseRef, pr.head.sha);
  const changedSinceApproval =
    event.action === "synchronize" && hasLabel
      ? riskyChangedSince(baseRef, event.before, pr.head.sha)
      : false;
  const result = decide({ risky, hasLabel, changedSinceApproval });
  if (result.removeLabel) await removeLabel(pr.number);
  console.log(result.message);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## human-gate\n\n${result.message}\n`,
    );
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
