// 여행지 글자로 나라를 짐작한다(#100 설계 §5.3.1). 표(이름 → 나라 코드)는 부르는 쪽이 넘긴다.
// node --test 로 시험하므로 다른 모듈을 import 하지 않는다.

const SEPARATORS = /[\s,·/()\-~&+]+/;
// 긴 것부터 하나만 뗀다. 뗀 뒤 두 글자 이상일 때만.
const SUFFIXES = [
  "특별자치도",
  "특별자치시",
  "특별시",
  "광역시",
  "여행",
  "시",
  "도",
  "섬",
];

function lookups(word: string): string[] {
  const words = [word];
  const suffix = SUFFIXES.find((s) => word.endsWith(s));
  if (suffix) {
    const rest = word.slice(0, -suffix.length);
    if ([...rest].length >= 2) words.push(rest);
  }
  return words;
}

// 낱말이 표 이름과 통째로 같을 때만 맞는다. 나온 나라가 하나뿐이면 그 코드, 없거나 둘 이상이면 null.
export function matchCountry(
  destination: string,
  names: Readonly<Record<string, string>>,
): string | null {
  const found = new Set<string>();
  for (const word of destination.split(SEPARATORS)) {
    if (word === "") continue;
    for (const key of lookups(word)) {
      const code = Object.hasOwn(names, key) ? names[key] : undefined;
      if (code) {
        found.add(code);
        break;
      }
    }
  }
  return found.size === 1 ? [...found][0] : null;
}
