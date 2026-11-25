// 여행지 → 나라 짐작에 쓰는 지명 표(src/lib/place-names.ts)를 GeoNames 데이터로 만든다(#100 설계 §5.3.2).
// 쓰는 법: https://download.geonames.org/export/dump/cities15000.zip 을 받아 풀고
//   node scripts/build-place-names.mjs <cities15000.txt 경로> && npx biome format --write src/lib/place-names.ts
// 데이터: GeoNames, CC BY 4.0. 받은 원본은 커밋하지 않는다.

import { readFileSync, writeFileSync } from "node:fs";
import { isCountryCode } from "../src/lib/countries.ts";

const OUT = new URL("../src/lib/place-names.ts", import.meta.url);

// 도시 파일에 없는 여행지(지역·섬). 도시 값보다 이긴다. 2026-11-25 Claude 판단, 늘려도 된다.
const EXTRA = {
  규슈: "JP",
  혼슈: "JP",
  시코쿠: "JP",
  홋카이도: "JP",
  오키나와: "JP",
  하와이: "US",
  사이판: "MP",
  발리: "ID",
  롬복: "ID",
  보라카이: "PH",
  보홀: "PH",
  팔라완: "PH",
  푸꾸옥: "VN",
  푸꼭: "VN",
  푸껫: "TH",
  코사무이: "TH",
  // 2026-11-25 확인에서 빠진 인기 여행지.
  강원: "KR",
  경기: "KR",
  충북: "KR",
  충남: "KR",
  전북: "KR",
  전남: "KR",
  경북: "KR",
  경남: "KR",
  통영: "KR",
  양양: "KR",
  남해: "KR",
  단양: "KR",
  하코네: "JP",
  유후인: "JP",
  지우펀: "TW",
  장가계: "CN",
  하이난: "CN",
  하롱베이: "VN",
  사파: "VN",
  달랏: "VN",
  무이네: "VN",
  클락: "PH",
  페낭: "MY",
  랑카위: "MY",
  인터라켄: "CH",
  퀸스타운: "NZ",
  오아후: "US",
};

const HANGUL_ONLY = /^[가-힣][가-힣 ]*$/;

const [path] = process.argv.slice(2);
if (!path) {
  console.error("cities15000.txt 경로를 주세요.");
  process.exit(1);
}

// 이름 → { code, population }. 같은 이름은 인구가 많은 도시의 나라.
const best = new Map();
function offer(name, code, population) {
  const prev = best.get(name);
  if (!prev || prev.population < population)
    best.set(name, { code, population });
}

for (const line of readFileSync(path, "utf8").split("\n")) {
  if (line === "") continue;
  const cols = line.split("\t");
  const alternateNames = cols[3];
  const code = cols[8];
  const population = Number(cols[14]) || 0;
  if (!isCountryCode(code)) continue;
  for (const raw of alternateNames.split(",")) {
    const name = raw.trim();
    if (!HANGUL_ONLY.test(name)) continue;
    const key = name.replace(/ /g, "");
    offer(key, code, population);
    // 일본 도시는 "오사카 시"처럼 적혀 있다. 끝의 "시"를 뗀 이름도 넣는다(두 글자 이상일 때).
    if (key.endsWith("시") && [...key].length >= 3) {
      offer(key.slice(0, -1), code, population);
    }
  }
}

const table = new Map([...best].map(([name, v]) => [name, v.code]));
for (const [name, code] of Object.entries(EXTRA)) table.set(name, code);

const entries = [...table].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const today = new Date().toISOString().slice(0, 10);
const body = entries.map(([name, code]) => `  ${name}: "${code}",`).join("\n");
writeFileSync(
  OUT,
  `// 만든 파일 — 손으로 고치지 않는다. scripts/build-place-names.mjs 로 다시 만든다.
// 데이터: GeoNames cities15000 (https://www.geonames.org/), CC BY 4.0. 받은 날짜: ${today}.
// 한국어 지명(빈칸 뺌) → 나라 코드(#100 설계 §5.3.2). 여행 양식에서만 동적 import 로 불러온다.

export const PLACE_NAMES: Readonly<Record<string, string>> = {
${body}
};
`,
);
console.log(`${entries.length} names → src/lib/place-names.ts`);
