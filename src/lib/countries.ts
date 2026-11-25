// 여행 나라(#100). 나라 목록과 나라 → 예산 통화 표. 사용자가 이 목록에서 고른 값만 저장한다(Google 값 아님).
// 서버(검증·이름 만들기)와 브라우저(짐작)가 함께 쓰고, node --test 로 시험하므로 다른 모듈을 import 하지 않는다.

// ISO 3166-1 alpha-2 에 정식으로 배정된 코드 249개(XK 같은 임시 코드는 넣지 않는다).
export const COUNTRY_CODES: readonly string[] = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ " +
  "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
  "HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY " +
  "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM " +
  "PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ " +
  "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

const CODE_SET: ReadonlySet<string> = new Set(COUNTRY_CODES);

// 고르기 목록 맨 위 "자주 가는 나라"(한국인 출국 많은 곳 기준, 설계 §5.2).
export const FREQUENT_COUNTRY_CODES: readonly string[] = [
  "KR",
  "JP",
  "VN",
  "CN",
  "TH",
  "PH",
  "TW",
  "US",
  "GU",
  "HK",
  "SG",
  "MY",
  "ID",
];

export function isCountryCode(value: string): boolean {
  return CODE_SET.has(value);
}

// 지원 통화(src/lib/budget.ts 의 CURRENCIES)를 법정 통화로 쓰는 나라만. 없으면 통화 처음 값이 없다.
const CURRENCY_COUNTRIES: Record<string, string> = {
  KRW: "KR",
  JPY: "JP",
  CNY: "CN",
  HKD: "HK",
  TWD: "TW",
  THB: "TH",
  VND: "VN",
  SGD: "SG",
  PHP: "PH",
  MYR: "MY",
  IDR: "ID",
  CAD: "CA",
  USD: "US GU MP AS PR VI EC SV TL FM MH PW BQ TC VG",
  // 유로존 21개국(2026 불가리아 가입) + 유로를 쓰는 비유로존 + 프랑스 해외 지역.
  EUR:
    "AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK " +
    "AD MC SM VA ME GF GP MQ YT RE BL MF PM",
  GBP: "GB IM JE GG",
  AUD: "AU KI NR TV CX CC NF",
  CHF: "CH LI",
};

export const COUNTRY_CURRENCY: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(CURRENCY_COUNTRIES).flatMap(([currency, codes]) =>
      codes.split(" ").map((code) => [code, currency]),
    ),
  );

export function countryCurrency(code: string): string | null {
  return COUNTRY_CURRENCY[code] ?? null;
}

export type CountryOption = { code: string; name: string };

// 한국어 나라 이름은 Intl 로 만든다. 서버에서 불러 양식에 넘긴다(브라우저와 ICU 가 달라 이름이 어긋나지 않게).
export function countryOptions(): {
  frequent: CountryOption[];
  all: CountryOption[];
} {
  const names = new Intl.DisplayNames(["ko"], { type: "region" });
  const option = (code: string): CountryOption => ({
    code,
    name: names.of(code) ?? code,
  });
  return {
    frequent: FREQUENT_COUNTRY_CODES.map(option),
    all: COUNTRY_CODES.map(option).sort((a, b) =>
      a.name.localeCompare(b.name, "ko"),
    ),
  };
}

// 나라 이름(빈칸 뺌) → 코드. 여행지 글자로 나라를 짐작할 때 쓴다.
export function countryNameIndex(
  options: readonly CountryOption[],
): Record<string, string> {
  return Object.fromEntries(
    options.map((o) => [o.name.replace(/\s+/g, ""), o.code]),
  );
}
