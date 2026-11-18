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
  primaryButtonClass,
  secondaryButtonClass,
} from "../styles";

const inputClass =
  "w-full rounded-xl border border-black/[.15] bg-transparent px-4 py-2.5 aria-[invalid=true]:border-red-600 dark:border-white/[.2]";

export type DateOption = { value: string; label: string };

type ScheduleItemFormProps = {
  action: (
    prev: ScheduleFormState,
    formData: FormData,
  ) => Promise<ScheduleFormState>;
  initialValues: ScheduleFields;
  // 있으면 날짜 고르기를 보인다(고치기).
  dateOptions?: DateOption[];
  mode: "add" | "edit";
  onClose: () => void;
  // 고치기에서만 "삭제" 버튼.
  onDelete?: () => void;
  deleting?: boolean;
};

// 일정 추가·고치기가 같이 쓰는 양식. 검증은 서버에서 하고, 오류와 입력값을 action 상태로 돌려받는다.
// 추가는 저장할 때마다 key 를 바꿔 빈 양식으로 다시 열고(연달아 적기), 고치기는 저장하면 접는다.
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
