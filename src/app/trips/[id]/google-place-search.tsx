"use client";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import { guessCategory, type PlaceCategory } from "@/lib/place-input";
import { PLACE_NOT_FOUND, PLACE_SEARCH_UNAVAILABLE } from "../messages";

// Google 장소 검색칸(Places API (New) 의 PlaceAutocompleteElement). '가 볼 곳' 넣기와 일정 장소 칸(#35)이 같이 쓴다.
// 고르면 브라우저가 이름·유형을 받아 이름표와 종류(짐작)를 넘긴다. 저장은 부르는 쪽이 한다(좌표는 서버가 받는다).
// 세션 토큰은 요소가 알아서 쓴다(고른 뒤 첫 fetchFields 까지 한 세션). APIProvider 안에서만 쓴다.
// 검색칸을 비우려면 부르는 쪽이 key 를 바꿔 새로 만든다.

export type GooglePick = {
  googlePlaceId: string;
  label: string;
  category: PlaceCategory;
};

export function GooglePlaceSearch({
  onPick,
  onError,
  ariaLabel = "장소 검색",
}: {
  onPick: (pick: GooglePick) => void;
  // 고른 장소를 받지 못했거나(PLACE_NOT_FOUND) 검색 요청이 실패했을 때(PLACE_SEARCH_UNAVAILABLE).
  onError: (message: string) => void;
  ariaLabel?: string;
}) {
  const placesLibrary = useMapsLibrary("places");
  const containerRef = useRef<HTMLDivElement>(null);
  // 요소는 한 번만 만들고, 부르는 쪽 함수가 바뀌어도 다시 만들지 않는다.
  const onPickRef = useRef(onPick);
  const onErrorRef = useRef(onError);
  onPickRef.current = onPick;
  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!placesLibrary || !container) return;
    let active = true;
    let pickCount = 0;

    const element = new placesLibrary.PlaceAutocompleteElement({
      placeholder: "장소 검색 (Google)",
      requestedLanguage: "ko",
    });
    element.style.width = "100%";
    element.style.colorScheme = "light dark";
    element.setAttribute("aria-label", ariaLabel);

    async function onSelect(
      event: google.maps.places.PlacePredictionSelectEvent,
    ) {
      const prediction = event.placePrediction;
      const pick = ++pickCount;
      try {
        const place = prediction.toPlace();
        await place.fetchFields({
          fields: ["displayName", "primaryType", "types"],
        });
        // 늦게 온 응답(그 사이 다시 고름, 화면을 떠남)은 버린다.
        if (!active || pick !== pickCount) return;
        onPickRef.current({
          googlePlaceId: place.id,
          label: place.displayName ?? prediction.mainText?.text ?? "",
          category: guessCategory(place.primaryType ?? null, place.types ?? []),
        });
      } catch {
        if (!active || pick !== pickCount) return;
        onErrorRef.current(PLACE_NOT_FOUND);
      }
    }

    // 자동완성 요청이 실패하면(할당량·키 문제 등) 요소가 알린다.
    function onRequestError() {
      if (active) onErrorRef.current(PLACE_SEARCH_UNAVAILABLE);
    }

    element.addEventListener("gmp-select", onSelect);
    element.addEventListener("gmp-error", onRequestError);
    container.append(element);
    return () => {
      active = false;
      element.removeEventListener("gmp-select", onSelect);
      element.removeEventListener("gmp-error", onRequestError);
      element.remove();
    };
  }, [placesLibrary, ariaLabel]);

  return (
    <div ref={containerRef} className="min-h-11">
      {!placesLibrary && (
        <p className="py-2.5 text-sm text-zinc-500">장소 검색을 불러오는 중…</p>
      )}
    </div>
  );
}
