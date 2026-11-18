"use client";

import { useTransition } from "react";
import { deleteTripAction } from "./actions";
import { dangerButtonClass } from "./styles";

export function DeleteTripButton({ tripId }: { tripId: string }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!window.confirm("정말 삭제할까요?")) return;
    startTransition(async () => {
      await deleteTripAction(tripId);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={dangerButtonClass}
    >
      {pending ? "삭제하는 중…" : "삭제"}
    </button>
  );
}
