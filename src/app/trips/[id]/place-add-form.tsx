"use client";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  guessCategory,
  type PlaceFields,
  type PlaceFormState,
} from "@/lib/place-input";
import { PLACE_NOT_FOUND } from "../messages";
import { createPlaceAction } from "../place-actions";
import { primaryButtonClass, secondaryButtonClass } from "../styles";
import { PlaceFieldInputs } from "./place-fields";

// 장소 넣기(§5.2): Google 자동완성(Places API (New) 의 PlaceAutocompleteElement)으로 고르면
// 브라우저가 이름·유형을 받아 이름 칸과 종류 칸을 미리 채운다(저장 전, 화면에만).
// [넣기]는 Google 장소 id·이름표·종류·메모만 보낸다. 좌표는 서버가 서버 키로 직접 받는다.
// APIProvider 안에서만 쓴다.

// 저장하면 key 를 바꿔 검색칸까지 새로 만든다. 화면을 떠날 때도 바꿔 다음 방문에 쓰다 만 값이 남지 않게 한다
// (trip-form.tsx 와 같은 방식, Next 는 지나온 화면을 숨겨 보관한다).
export function PlaceAddForm({ tripId }: { tripId: string }) {
  const [version, setVersion] = useState(0);
  useLayoutEffect(() => () => setVersion((v) => v + 1), []);
  return (
    <PlaceSearch
      key={version}
      tripId={tripId}
      onSaved={() => setVersion((v) => v + 1)}
    />
  );
}

type Picked = PlaceFields & { pick: number };

function PlaceSearch({
  tripId,
  onSaved,
}: {
  tripId: string;
  onSaved: () => void;
}) {
  const placesLibrary = useMapsLibrary("places");
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(
    null,
  );
  const [picked, setPicked] = useState<Picked | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!placesLibrary || !container) return;
    let active = true;
    let pickCount = 0;

    // 세션 토큰은 이 요소가 알아서 쓴다(고른 뒤 첫 fetchFields 까지 한 세션).
    const element = new placesLibrary.PlaceAutocompleteElement({
      placeholder: "장소 검색 (Google)",
      requestedLanguage: "ko",
    });
    element.style.width = "100%";
    element.style.colorScheme = "light dark";
    element.setAttribute("aria-label", "장소 검색");

    async function onSelect(
      event: google.maps.places.PlacePredictionSelectEvent,
    ) {
      const prediction = event.placePrediction;
      const pick = ++pickCount;
      setPickError(null);
      try {
        const place = prediction.toPlace();
        await place.fetchFields({
          fields: ["displayName", "primaryType", "types"],
        });
        if (!active || pick !== pickCount) return;
        setPicked({
          pick,
          googlePlaceId: place.id,
          label: place.displayName ?? prediction.mainText?.text ?? "",
          category: guessCategory(place.primaryType ?? null, place.types ?? []),
          memo: "",
        });
      } catch {
        if (!active || pick !== pickCount) return;
        setPicked(null);
        setPickError(PLACE_NOT_FOUND);
      }
    }

    element.addEventListener("gmp-select", onSelect);
    container.append(element);
    elementRef.current = element;
    return () => {
      active = false;
      element.removeEventListener("gmp-select", onSelect);
      element.remove();
      elementRef.current = null;
    };
  }, [placesLibrary]);

  function cancel() {
    setPicked(null);
    setPickError(null);
    if (elementRef.current) elementRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="min-h-11">
        {!placesLibrary && (
          <p className="py-2.5 text-sm text-zinc-500">
            장소 검색을 불러오는 중…
          </p>
        )}
      </div>
      {pickError && (
        <p role="alert" className="text-sm text-red-600">
          {pickError}
        </p>
      )}
      {picked && (
        <PlaceDraftForm
          key={picked.pick}
          tripId={tripId}
          picked={picked}
          onCancel={cancel}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

// 고른 장소의 이름표·종류·메모를 확인하고 넣는다. 다시 고르면 key 가 바뀌어 새 값으로 채운다.
function PlaceDraftForm({
  tripId,
  picked,
  onCancel,
  onSaved,
}: {
  tripId: string;
  picked: PlaceFields;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<PlaceFormState, FormData>(
    createPlaceAction.bind(null, tripId),
    {
      values: picked,
      errors: {},
      formError: null,
      savedAt: null,
    },
  );
  const idPrefix = useId();

  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  useEffect(() => {
    if (state.savedAt !== null) onSavedRef.current();
  }, [state.savedAt]);

  const formError = state.formError ?? state.errors.googlePlaceId ?? null;

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-4 rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145]"
    >
      {formError && (
        <p
          role="alert"
          className="rounded-xl bg-red-600/10 px-4 py-3 text-sm text-red-600"
        >
          {formError}
        </p>
      )}
      <input type="hidden" name="googlePlaceId" value={picked.googlePlaceId} />
      <PlaceFieldInputs
        idPrefix={idPrefix}
        values={state.values}
        errors={state.errors}
      />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "넣는 중…" : "넣기"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className={secondaryButtonClass}
        >
          취소
        </button>
      </div>
    </form>
  );
}
