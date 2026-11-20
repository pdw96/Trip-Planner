"use client";

import {
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  cardClass,
  errorTextClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/app/ui/styles";
import type { PlaceFields, PlaceFormState } from "@/lib/place-input";
import { createPlaceAction } from "../place-actions";
import { GooglePlaceSearch } from "./google-place-search";
import { PlaceFieldInputs } from "./place-fields";

// 장소 넣기(§5.2): Google 자동완성(google-place-search.tsx)으로 고르면
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
  const [picked, setPicked] = useState<Picked | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  // 취소하면 검색칸을 새로 만들어 비운다.
  const [searchKey, setSearchKey] = useState(0);
  const pickCount = useRef(0);

  function cancel() {
    setPicked(null);
    setPickError(null);
    setSearchKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-3">
      <GooglePlaceSearch
        key={searchKey}
        onPick={(pick) => {
          setPickError(null);
          setPicked({ ...pick, memo: "", pick: ++pickCount.current });
        }}
        onError={(message) => {
          setPicked(null);
          setPickError(message);
        }}
      />
      {pickError && (
        <p role="alert" className={errorTextClass}>
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
      className={`flex flex-col gap-4 ${cardClass}`}
    >
      {formError && (
        <p
          role="alert"
          className="rounded-[10px] bg-danger/10 px-4 py-3 text-sm text-danger"
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
