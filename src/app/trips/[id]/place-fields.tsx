import type { Ref } from "react";
import { errorTextClass, fieldClass } from "@/app/ui/styles";
import {
  CATEGORY_LABELS,
  PLACE_CATEGORIES,
  type PlaceFieldErrors,
  type PlaceFields,
} from "@/lib/place-input";

// 장소 넣기·고치기 양식이 같이 쓰는 입력칸: 이름표·종류·메모. 검증은 서버(place-input.ts)가 한다.
export function PlaceFieldInputs({
  idPrefix,
  values,
  errors,
  labelRef,
}: {
  idPrefix: string;
  values: PlaceFields;
  errors: PlaceFieldErrors;
  labelRef?: Ref<HTMLInputElement>;
}) {
  return (
    <>
      <Field idPrefix={idPrefix} name="label" label="이름" error={errors.label}>
        {(props) => (
          <input
            {...props}
            ref={labelRef}
            type="text"
            defaultValue={values.label}
            className={`w-full ${fieldClass}`}
          />
        )}
      </Field>
      <Field
        idPrefix={idPrefix}
        name="category"
        label="종류"
        error={errors.category}
      >
        {(props) => (
          <select
            {...props}
            defaultValue={values.category}
            className={`w-full ${fieldClass}`}
          >
            {PLACE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field
        idPrefix={idPrefix}
        name="memo"
        label="메모 (선택)"
        error={errors.memo}
      >
        {(props) => (
          <input
            {...props}
            type="text"
            defaultValue={values.memo}
            className={`w-full ${fieldClass}`}
          />
        )}
      </Field>
    </>
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
  name: keyof PlaceFields;
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
        <p id={errorId} role="alert" className={errorTextClass}>
          {error}
        </p>
      )}
    </div>
  );
}
