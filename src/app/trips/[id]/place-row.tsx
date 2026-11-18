"use client";

import {
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { placeUrl } from "@/lib/leg-display";
import type { PlaceFormState } from "@/lib/place-input";
import { deletePlaceAction, updatePlaceAction } from "../place-actions";
import { primaryButtonClass, secondaryButtonClass } from "../styles";
import {
  CATEGORY_ICONS,
  categoryLabel,
  type PanelPlace,
  scheduleDaysText,
} from "./map-types";
import { PlaceFieldInputs } from "./place-fields";

// "가 볼 곳" 목록의 한 줄. ⋯ 메뉴에서 그 자리 고치기(이름표·종류·메모)와 삭제.
// 고치기 칸은 한 번에 하나다: 어느 줄이 열렸는지는 패널이 쥐고 있다(editing, onEdit, onCloseEdit).
export function PlaceRow({
  tripId,
  place,
  highlighted,
  distance,
  editing,
  onEdit,
  onCloseEdit,
  onShowOnMap,
}: {
  tripId: string;
  place: PanelPlace;
  highlighted: boolean;
  // 전체 보기에서 기준점을 골랐을 때만: "기준점" 또는 "3.4km".
  distance: string | null;
  editing: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  // 지도가 있고 이 장소에 좌표가 있을 때만.
  onShowOnMap: (() => void) | null;
}) {
  const [deleting, startDelete] = useTransition();

  function onDelete() {
    if (!window.confirm("이 장소를 삭제할까요?")) return;
    startDelete(async () => {
      await deletePlaceAction(tripId, place.id);
    });
  }

  if (editing) {
    return (
      <li className="py-2">
        <PlaceEditForm tripId={tripId} place={place} onClose={onCloseEdit} />
      </li>
    );
  }

  const days = scheduleDaysText(place.scheduleDays);
  const located = place.lat !== null && place.lng !== null;

  return (
    <li
      className={`flex items-start gap-3 rounded-xl px-2 py-2 ${highlighted ? "bg-amber-400/15" : ""} ${deleting ? "opacity-50" : ""}`}
    >
      <span className="w-9 shrink-0 pt-0.5 text-sm text-zinc-500">
        {categoryLabel(place.category)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <a
          href={placeUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start font-medium break-words hover:underline"
        >
          {CATEGORY_ICONS[place.category]} {place.label}
        </a>
        {place.memo && (
          <p className="text-sm break-words text-zinc-600 dark:text-zinc-400">
            “{place.memo}”
          </p>
        )}
        {(days || distance) && (
          <p className="text-sm text-zinc-500">
            {[distance, days].filter(Boolean).join(" · ")}
          </p>
        )}
        {!located && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            위치 정보를 다시 불러오지 못했어요.
          </p>
        )}
      </div>
      {onShowOnMap && located && (
        <button
          type="button"
          onClick={onShowOnMap}
          aria-label={`${place.label} 지도에서 보기`}
          className="shrink-0 rounded-full px-2 py-1 text-sm text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]"
        >
          지도
        </button>
      )}
      <RowMenu
        label={place.label}
        disabled={deleting}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </li>
  );
}

// ⋯ 메뉴. 바깥을 누르거나 Esc 를 누르면 닫히고, 화면을 떠날 때도 닫는다(Activity 보관, docs/status.md).
function RowMenu({
  label,
  disabled,
  onEdit,
  onDelete,
}: {
  label: string;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useLayoutEffect(() => () => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const itemClass =
    "block w-full px-4 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label={`${label} 메뉴`}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="rounded-full px-2 py-1 text-zinc-600 hover:bg-black/[.04] disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[.06]"
      >
        ⋯
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 z-10 mt-1 w-28 overflow-hidden rounded-xl border border-black/[.08] bg-background py-1 shadow-lg dark:border-white/[.145]"
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className={itemClass}
          >
            고치기
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className={`${itemClass} text-red-600`}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}

function PlaceEditForm({
  tripId,
  place,
  onClose,
}: {
  tripId: string;
  place: PanelPlace;
  onClose: () => void;
}) {
  // 저장에 성공하면 같은 전환 안에서 닫는다(schedule-editor.tsx 와 같은 이유: 목록 순서가 바뀌어도 다시 열리지 않게).
  async function saveAndClose(
    prev: PlaceFormState,
    formData: FormData,
  ): Promise<PlaceFormState> {
    const next = await updatePlaceAction(tripId, place.id, prev, formData);
    if (next.savedAt !== prev.savedAt) onClose();
    return next;
  }

  const [state, formAction, pending] = useActionState(saveAndClose, {
    values: {
      googlePlaceId: place.googlePlaceId,
      label: place.label,
      category: place.category,
      memo: place.memo ?? "",
    },
    errors: {},
    formError: null,
    savedAt: null,
  });
  const idPrefix = useId();
  const labelRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    labelRef.current?.focus();
  }, []);

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
      <PlaceFieldInputs
        idPrefix={idPrefix}
        values={state.values}
        errors={state.errors}
        labelRef={labelRef}
      />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "저장하는 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className={secondaryButtonClass}
        >
          취소
        </button>
      </div>
    </form>
  );
}
