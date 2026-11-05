"use client";

import { setAllowSavingAction } from "@/app/(app)/actions/settings";
import { useActionForm } from "@/components/use-action-form";

export function AllowSavingToggle({ defaultChecked }: { defaultChecked: boolean }) {
  const [error, formAction, pending] = useActionForm(setAllowSavingAction);
  return (
    <form action={formAction} className="space-y-1">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="allowSaving"
          defaultChecked={defaultChecked}
          disabled={pending}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="size-5"
        />
        <span>Permetti di conservare le mie lanterne</span>
      </label>
      <p className="text-sm text-muted-foreground">Vale per le lanterne che invierai da ora in poi</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
