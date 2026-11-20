"use client";

import { useTransition } from "react";
import { dangerButtonClass } from "@/app/ui/styles";
import { deleteTripAction } from "./actions";

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
