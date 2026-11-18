"use client";

import {
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ScheduleFields, ScheduleFormState } from "@/lib/schedule-input";
import {
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../styles";
import { CATEGORY_ICONS, type PlaceOption } from "./map-types";

export type DateOption = { value: string; label: string };

type ScheduleItemFormProps = {
  action: (
    prev: ScheduleFormState,
    formData: FormData,
  ) => Promise<ScheduleFormState>;
  initialValues: ScheduleFields;
  // 있으면 날짜 고르기를 보인다(고치기).
  dateOptions?: DateOption[];
  // 이 여행의 장소(숙소 먼저). 있으면 장소 칸에서 고를 수 있다.
  places: PlaceOption[];
  mode: "add" | "edit";
  onClose: () => void;
  // 고치기에서만 "삭제" 버튼.
  onDelete?: () => void;
  deleting?: boolean;
};

// 일정 추가·고치기가 같이 쓰는 양식. 검증은 서버에서 하고, 오류와 입력값을 action 상태로 돌려받는다.
// 추가는 저장할 때마다 key 를 바꿔 빈 양식으로 다시 열고(연달아 적기), 고치기는 저장하면 접는다.
// (고치기를 접는 일은 부르는 쪽 action 이 같은 전환 안에서 한다. 여기서의 onClose 는 그 뒤의 안전장치다.)
export function ScheduleItemForm(props: ScheduleItemFormProps) {
  const [version, setVersion] = useState(0);
  const { mode, onClose } = props;
  return (
    <ScheduleItemFields
      key={version}
      {...props}
      onSaved={mode === "add" ? () => setVersion((v) => v + 1) : onClose}
    />
  );
}

function ScheduleItemFields({
  action,
  initialValues,
  dateOptions,
  places,
  mode,
  onClose,
  onDelete,
  deleting = false,
  onSaved,
}: ScheduleItemFormProps & { onSaved: () => void }) {
  const [state, formAction, pending] = useActionState(action, {
    values: initialValues,
    errors: {},
    formError: null,
    savedAt: null,
  });
  const { values, errors } = state;
  const idPrefix = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  // 열릴 때(추가는 저장 뒤 다시 열릴 때도) 제목 칸에 초점.
  useLayoutEffect(() => {
    titleRef.current?.focus();
  }, []);

  // 저장에 성공하면 savedAt 이 새 값으로 바뀐다.
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  useEffect(() => {
    if (state.savedAt !== null) onSavedRef.current();
  }, [state.savedAt]);

  const busy = pending || deleting;

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-4 rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145]"
    >
      {state.formError && (
        <p
          role="alert"
          className="rounded-xl bg-red-600/10 px-4 py-3 text-sm text-red-600"
        >
          {state.formError}
        </p>
      )}
      {dateOptions && (
        <Field idPrefix={idPrefix} label="날짜" name="date" error={errors.date}>
          {(props) => (
            <select
              {...props}
              defaultValue={values.date}
              className={inputClass}
            >
              {dateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {!dateOptions && errors.date && (
        <p role="alert" className="text-sm text-red-600">
          {errors.date}
        </p>
      )}
      <Field
        idPrefix={idPrefix}
        label="시각 (선택)"
        name="time"
        error={errors.time}
      >
        {(props) => (
          <input
            {...props}
            type="time"
            defaultValue={values.time}
            className={inputClass}
          />
        )}
      </Field>
      <Field idPrefix={idPrefix} label="제목" name="title" error={errors.title}>
        {(props) => (
          <input
            {...props}
            ref={titleRef}
            type="text"
            defaultValue={values.title}
            className={inputClass}
          />
        )}
      </Field>
      {places.length > 0 ? (
        <PlaceField
          key={resultKey(state)}
          idPrefix={idPrefix}
          places={places}
          values={values}
          error={errors.place}
        />
      ) : (
        <Field
          idPrefix={idPrefix}
          label="장소 (선택)"
          name="place"
          error={errors.place}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              defaultValue={values.place}
              className={inputClass}
            />
          )}
        </Field>
      )}
      <Field
        idPrefix={idPrefix}
        label="메모 (선택)"
        name="memo"
        error={errors.memo}
      >
        {(props) => (
          <textarea
            {...props}
            rows={3}
            defaultValue={values.memo}
            className={inputClass}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {pending ? "저장하는 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className={secondaryButtonClass}
        >
          {mode === "add" ? "닫기" : "취소"}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className={`${dangerButtonClass} ml-auto`}
          >
            {deleting ? "삭제하는 중…" : "삭제"}
          </button>
        )}
      </div>
    </form>
  );
}

// 액션 결과(state 객체)마다 다른 키. React 19 는 제출할 때마다(검증 오류로 돌아와도) form.reset() 을 하므로,
// 장소 칸을 결과마다 다시 만들어 select·글자 칸·보이기 상태를 돌려받은 values 로 함께 맞춘다.
const resultKeys = new WeakMap<object, number>();
let lastResultKey = 0;
function resultKey(state: object): number {
  let key = resultKeys.get(state);
  if (key === undefined) {
    key = ++lastResultKey;
    resultKeys.set(state, key);
  }
  return key;
}

// 장소 칸: 이 여행의 장소 중 고르기(맨 위 "직접 적기") + 직접 적기일 때만 보이는 글자 칸(§5.4).
// 장소를 고르면 서버가 그 장소의 이름표를 place 글자로 저장하므로 글자 칸은 보내지 않는다.
// select 는 제어하지 않는다(defaultValue). 제어하면 form.reset() 뒤 화면은 "직접 적기"로 돌아가는데
// React 상태는 고른 장소로 남아 글자 칸이 숨은 채 placeId="" 가 제출된다. onChange 는 글자 칸 보이기만 바꾼다.
function PlaceField({
  idPrefix,
  places,
  values,
  error,
}: {
  idPrefix: string;
  places: PlaceOption[];
  values: ScheduleFields;
  error: string | undefined;
}) {
  // 이어졌던 장소가 그 사이 지워졌으면 직접 적기로 연다(글자는 그대로 남아 있다).
  const initialPlaceId = places.some((place) => place.id === values.placeId)
    ? values.placeId
    : "";
  const [chosenId, setChosenId] = useState(initialPlaceId);
  // 고른 장소가 다시 그린 목록에서 사라지면(다른 곳에서 지움) 브라우저 select 는 "직접 적기"로 돌아간다.
  // 보이기도 목록에 있는지로 정해, 화면·글자 칸·제출 값이 같은 "직접 적기"가 되게 한다(글자 칸은 일정의 장소 글자로 채움).
  const placeId = places.some((place) => place.id === chosenId) ? chosenId : "";
  const selectId = `${idPrefix}-placeId`;
  const textId = `${idPrefix}-place`;
  const errorId = `${idPrefix}-place-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium">
        장소 (선택)
      </label>
      <select
        id={selectId}
        name="placeId"
        defaultValue={initialPlaceId}
        onChange={(event) => setChosenId(event.target.value)}
        aria-invalid={Boolean(error) && placeId !== ""}
        aria-describedby={error && placeId !== "" ? errorId : undefined}
        className={inputClass}
      >
        <option value="">직접 적기</option>
        {places.map((place) => (
          <option key={place.id} value={place.id}>
            {CATEGORY_ICONS[place.category]} {place.label}
          </option>
        ))}
      </select>
      {placeId === "" && (
        <input
          id={textId}
          name="place"
          type="text"
          defaultValue={values.place}
          aria-label="장소 직접 적기"
          placeholder="장소 이름"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={inputClass}
        />
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

type ControlProps = {
  id: string;
  name: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
};

function Field({
  idPrefix,
  label,
  name,
  error,
  children,
}: {
  idPrefix: string;
  label: string;
  name: keyof ScheduleFields;
  error: string | undefined;
  children: (props: ControlProps) => React.ReactNode;
}) {
  const id = `${idPrefix}-${name}`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        name,
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
