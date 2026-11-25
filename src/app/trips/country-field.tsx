"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fieldClass } from "@/app/ui/styles";
import { type CountryOption, countryNameIndex } from "@/lib/countries";
import { matchCountry } from "@/lib/place-match";

// 여행 나라 고르기(#100 설계 §5.3). 사용자가 직접 바꾸기 전까지는 여행지 글자로 짐작한 나라를 따른다(§5.3.1).
// 나라 이름은 서버가 만들어 넘긴다(브라우저와 ICU 가 달라 이름이 어긋나지 않게). 지명 표는 여기서만 따로 받는다.

export type CountryChoices = {
  frequent: CountryOption[];
  all: CountryOption[];
};

type ControlProps = {
  id: string;
  name: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
};

const linkClass = "underline hover:text-foreground";

export function CountrySelect({
  controlProps,
  countries,
  destination,
  initialValue,
}: {
  controlProps: ControlProps;
  countries: CountryChoices;
  destination: string;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  // 처음 값이 있으면(고치기, 검증 오류로 돌아온 값) 사용자가 고른 것으로 본다.
  const [touched, setTouched] = useState(initialValue !== "");
  const [placeNames, setPlaceNames] = useState<Readonly<
    Record<string, string>
  > | null>(null);

  useEffect(() => {
    let active = true;
    import("@/lib/place-names")
      .then((m) => {
        if (active) setPlaceNames(m.PLACE_NAMES);
      })
      // 받지 못하면 짐작 없이 직접 고르기만 된다.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // 나라 이름이 같은 도시 이름보다 이긴다.
  const names = useMemo(
    () => placeNames && { ...placeNames, ...countryNameIndex(countries.all) },
    [placeNames, countries],
  );
  const guess = !touched && names ? matchCountry(destination, names) : null;
  const selected = touched || !names ? value : (guess ?? "");
  const hintId = `${controlProps.id}-hint`;

  // React 는 action 이 끝난 뒤(다시 그린 다음) 양식을 reset 한다. 제어 select 는 그때 첫 항목("선택 안 함")으로
  // 돌아가고 React 가 다시 맞추지 않아, 검증 오류 뒤 다시 저장하면 나라가 빠진다. reset 직후 고른 값을 되돌린다.
  const selectRef = useRef<HTMLSelectElement>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    const form = selectRef.current?.form;
    if (!form) return;
    function restore() {
      // reset 이벤트는 reset 전에 온다. 끝난 뒤에 되돌린다.
      queueMicrotask(() => {
        if (selectRef.current) selectRef.current.value = selectedRef.current;
      });
    }
    form.addEventListener("reset", restore);
    return () => form.removeEventListener("reset", restore);
  }, []);

  return (
    <>
      <select
        {...controlProps}
        ref={selectRef}
        aria-describedby={[hintId, controlProps["aria-describedby"]]
          .filter(Boolean)
          .join(" ")}
        value={selected}
        onChange={(e) => {
          setValue(e.target.value);
          setTouched(true);
        }}
        className={`w-full ${fieldClass}`}
      >
        <option value="">선택 안 함</option>
        <optgroup label="자주 가는 나라">
          {countries.frequent.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="전체 (가나다순)">
          {countries.all.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </optgroup>
      </select>
      <div id={hintId} className="flex flex-col gap-0.5 text-sm text-sub">
        {guess && <p>여행지를 보고 골랐어요. 다르면 바꿔 주세요.</p>}
        <p>예산을 처음 정할 때 현지 통화와 환율을 미리 채워요.</p>
      </div>
      <p className="text-xs text-sub">
        지명 데이터:{" "}
        <a
          href="https://www.geonames.org/"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          GeoNames
        </a>{" "}
        (
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          CC BY 4.0
        </a>
        )
      </p>
    </>
  );
}
