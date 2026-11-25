"use client";

import Link from "next/link";
import { useActionState, useLayoutEffect, useState } from "react";
import {
  errorTextClass,
  fieldAreaClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/app/ui/styles";
import type { CalendarRange } from "@/lib/calendar";
import type { TripFields, TripFormState } from "@/lib/trip-input";
import { type CountryChoices, CountrySelect } from "./country-field";
import { DateRangePicker } from "./date-range-picker";

type TripFormProps = {
  action: (prev: TripFormState, formData: FormData) => Promise<TripFormState>;
  initialValues: TripFields;
  submitLabel: string;
  cancelHref: string;
  today: string;
  range: CalendarRange;
  holidays: Promise<string[]>;
  // 나라 고르기 목록(서버의 countryOptions()).
  countries: CountryChoices;
};

// 만들기·고치기가 같이 쓰는 양식. 검증은 서버에서 하고, 오류와 입력값을 action 상태로 돌려받는다.
// Next 는 지나온 화면을 숨겨 보관(Activity)하므로, 화면을 떠날 때 key 를 바꿔 다시 열면 새 양식이 되게 한다.
// (그대로 두면 취소한 초안이나 지난 오류 문구가 다음 방문에 남는다.)
export function TripForm(props: TripFormProps) {
  const [version, setVersion] = useState(0);
  useLayoutEffect(() => () => setVersion((v) => v + 1), []);
  return <TripFormFields key={version} {...props} />;
}

function TripFormFields({
  action,
  initialValues,
  submitLabel,
  cancelHref,
  today,
  range,
  holidays,
  countries,
}: TripFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    values: initialValues,
    errors: {},
    formError: null,
  });
  const { values, errors } = state;
  // 나라 짐작에 쓰는 여행지 글자(칸 자체는 지금처럼 defaultValue).
  const [destination, setDestination] = useState(values.destination);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3.5">
      {state.formError && (
        <p
          role="alert"
          className="rounded-[10px] bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {state.formError}
        </p>
      )}
      <Field label="여행 이름" name="title" error={errors.title}>
        {(props) => (
          <input
            {...props}
            type="text"
            defaultValue={values.title}
            className={`w-full ${fieldClass}`}
          />
        )}
      </Field>
      <Field label="여행지" name="destination" error={errors.destination}>
        {(props) => (
          <input
            {...props}
            type="text"
            defaultValue={values.destination}
            onChange={(e) => setDestination(e.target.value)}
            className={`w-full ${fieldClass}`}
          />
        )}
      </Field>
      <Field label="나라 (선택)" name="countryCode" error={errors.countryCode}>
        {(props) => (
          <CountrySelect
            controlProps={props}
            countries={countries}
            destination={destination}
            initialValue={values.countryCode}
          />
        )}
      </Field>
      <DateRangePicker
        startDate={values.startDate}
        endDate={values.endDate}
        today={today}
        range={range}
        holidays={holidays}
        error={errors.startDate ?? errors.endDate}
      />
      <Field label="메모 (선택)" name="notes" error={errors.notes}>
        {(props) => (
          <textarea
            {...props}
            rows={5}
            defaultValue={values.notes}
            className={`w-full ${fieldAreaClass}`}
          />
        )}
      </Field>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "저장하는 중…" : submitLabel}
        </button>
        <Link href={cancelHref} className={secondaryButtonClass}>
          취소
        </Link>
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
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: keyof TripFields;
  error: string | undefined;
  children: (props: ControlProps) => React.ReactNode;
}) {
  const id = `trip-${name}`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      {children({
        id,
        name,
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} role="alert" className={errorTextClass}>
          {error}
        </p>
      )}
    </div>
  );
}
