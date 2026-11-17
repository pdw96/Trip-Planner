#!/usr/bin/env node
// human-gate: 위험 경로를 건드린 PR 은 사람이 `human-approved` 라벨을 붙여야 통과한다.
// 설계: docs/superpowers/specs/2026-11-17-ai-native-workflow-design.md (6.4)
// 이 파일의 목록이 위험 경로의 기준이다. CLAUDE.md 의 목록은 이것을 옮긴 것이다.
//
// 승인은 "라벨이 붙은 순간의 위험 변경"에 묶인다. 라벨이 붙을 때 그 변경의 해시를
// github-actions[bot] 코멘트로 남기고, 이후 모든 실행은 지금의 위험 변경을 그 해시와 비교한다.
// 다르거나 기록이 없으면 라벨을 떼고 실패한다. 중간 실행이 취소·생략돼도 결과는 같다.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LABEL = "human-approved";
const BOT = "github-actions[bot]";
const MARKER = /<!-- human-gate-approval sha256=([0-9a-f]+) -->/;

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
// -z: 한글 등 non-ASCII 파일명을 git 이 따옴표로 감싸 바꾸지 않도록 NUL 로 구분해 받는다.
export function riskyFiles(baseRef, sha, cwd) {
  const base = mergeBase(baseRef, sha, cwd);
  return git(["diff", "--name-only", "-z", "--no-renames", base, sha], cwd)
    .split("\0")
    .filter(Boolean)
    .filter(isRisky);
}

// PR 쪽 위험 변경 내용의 해시. merge-base 기준이라 main 병합으로 들어온 변경은 빠진다.
// main 이 같은 파일의 떨어진 줄을 고쳐도 같게 나오도록 blob 해시(index 줄)와 줄 번호(@@ … @@)를 지운다.
// --text: NUL 바이트가 있어 바이너리로 판정되는 파일도 내용이 해시에 들어가게 한다.
// 문맥 3줄과 @@ 뒤 함수 이름은 남겨, 같은 문장이라도 다른 위치의 변경이면 다르게 나온다.
// (main 이 PR 변경 바로 근처를 고치면 승인이 풀린다. 안전한 쪽으로 틀리는 것이다.)
export function riskyPatchHash(baseRef, sha, cwd) {
  const files = riskyFiles(baseRef, sha, cwd);
  const patch =
    files.length === 0
      ? ""
      : git(
          [
            "diff",
            "--text",
            "--no-renames",
            mergeBase(baseRef, sha, cwd),
            sha,
            "--",
            ...files,
          ],
          cwd,
        )
          .split("\n")
          .filter((line) => !line.startsWith("index "))
          .map((line) => line.replace(/^@@ [^@]* @@/, "@@ @@"))
          .join("\n");
  return createHash("sha256").update(patch).digest("hex");
}

export const approvalMarker = (hash) =>
  `<!-- human-gate-approval sha256=${hash} -->`;

// 승인 기록은 github-actions[bot] 이 남긴 코멘트만 믿는다. 사람이나 Claude(사용자 계정)가 쓴 것은 무시한다.
// notBefore(라벨이 마지막으로 붙은 시각)보다 이전 기록은 무시한다. 라벨을 다시 붙였다면 그 뒤의 기록만 유효하다.
export function findApprovalHash(comments, notBefore = null) {
  for (const comment of [...comments].reverse()) {
    if (comment.user?.login !== BOT) continue;
    if (notBefore && (comment.created_at ?? "") < notBefore) continue;
    const match = comment.body?.match(MARKER);
    if (match) return match[1];
  }
  return null;
}

// 이슈 이벤트에서 `human-approved` 가 마지막으로 붙은 시각. 없으면 null.
export function lastLabeledAt(events) {
  const labeled = events.filter(
    (e) => e.event === "labeled" && e.label?.name === LABEL,
  );
  return labeled.at(-1)?.created_at ?? null;
}

// 라벨은 있는데 기록이 없을 때, 동시에 돌고 있는 labeled 실행이 기록을 남길 때까지 잠시 기다리며 다시 읽는다.
export async function waitForApprovalHash(
  fetchComments,
  { tries = 6, delayMs = 10_000, notBefore = null } = {},
) {
  for (let i = 0; i < tries; i++) {
    const hash = findApprovalHash(await fetchComments(), notBefore);
    if (hash !== null || i === tries - 1) return hash;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

export function decide({
  risky,
  hasLabel,
  labeledNow,
  approvedHash,
  currentHash,
}) {
  const result = (pass, message, extra = {}) => ({
    pass,
    removeLabel: false,
    recordApproval: false,
    message,
    ...extra,
  });
  if (risky.length === 0)
    return result(
      true,
      "위험 경로를 건드리지 않았습니다. 사람 승인이 필요 없습니다.",
    );
  const list = risky.map((f) => `- ${f}`).join("\n");
  if (!hasLabel)
    return result(
      false,
      `위험 경로를 건드렸습니다. 사람이 확인한 뒤 \`${LABEL}\` 라벨을 붙이세요.\n\n${list}`,
    );
  if (labeledNow)
    return result(
      true,
      `\`${LABEL}\` 라벨로 지금의 위험 경로 변경을 승인으로 기록했습니다.\n\n${list}`,
      { recordApproval: true },
    );
  if (approvedHash === currentHash)
    return result(
      true,
      `\`${LABEL}\` 라벨로 승인된 위험 경로 변경입니다.\n\n${list}`,
    );
  // 기록이 없으면 라벨은 그대로 둔다. 방금 붙은 라벨의 labeled 실행이 아직 기록하지 못했을 수 있다.
  if (approvedHash === null)
    return result(
      false,
      `\`${LABEL}\` 라벨은 있지만 승인 기록이 아직 없습니다. 라벨이 방금 붙었다면 곧 다시 실행됩니다. 계속 실패하면 라벨을 떼었다가 다시 붙이세요.\n\n${list}`,
    );
  return result(
    false,
    `승인 이후 위험 경로가 바뀌어 승인을 해제했습니다. 다시 확인한 뒤 \`${LABEL}\` 라벨을 붙이세요.\n\n${list}`,
    { removeLabel: true },
  );
}

async function github(method, url, body) {
  const { GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env;
  const res = await fetch(
    `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/${url}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  if (method === "DELETE" && res.status === 404) return null;
  if (!res.ok) throw new Error(`${method} ${url}: HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

// 목록 API 를 마지막 페이지까지 읽는다(코멘트가 100개를 넘어도 최신 승인 기록을 찾도록).
async function githubAll(url) {
  const all = [];
  for (let page = 1; ; page++) {
    const items = await github("GET", `${url}?per_page=100&page=${page}`);
    all.push(...items);
    if (items.length < 100) return all;
  }
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const pr = event.pull_request;
  const n = pr.number;
  const baseRef = `origin/${pr.base.ref}`;
  // 워크플로가 refs/remotes/pr/head 로 PR head 를 가져온다. 이벤트의 head.sha 와 같아야 한다.
  const sha = pr.head.sha;

  // 이벤트 payload 의 라벨은 오래됐을 수 있어 지금 라벨을 API 로 읽는다.
  const labels = await githubAll(`issues/${n}/labels`);
  const hasLabel = labels.some((l) => l.name === LABEL);
  const labeledNow = event.action === "labeled" && event.label?.name === LABEL;
  const risky = riskyFiles(baseRef, sha);
  const currentHash = riskyPatchHash(baseRef, sha);
  const approvedHash =
    hasLabel && !labeledNow && risky.length > 0
      ? await waitForApprovalHash(() => githubAll(`issues/${n}/comments`), {
          notBefore: lastLabeledAt(await githubAll(`issues/${n}/events`)),
        })
      : null;
  const result = decide({
    risky,
    hasLabel,
    labeledNow,
    approvedHash,
    currentHash,
  });

  console.log(result.message);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## human-gate\n\n${result.message}\n`,
    );
  if (result.recordApproval)
    await github("POST", `issues/${n}/comments`, {
      body: `human-gate: \`${sha.slice(0, 7)}\` 시점의 위험 경로 변경을 사람 승인으로 기록했습니다. 이후 위험 경로가 바뀌면 승인이 해제됩니다.\n\n${approvalMarker(currentHash)}`,
    });
  if (result.removeLabel) await github("DELETE", `issues/${n}/labels/${LABEL}`);
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
