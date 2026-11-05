"use client";

import { useState, useTransition } from "react";
import { setAllowSavingAction } from "@/app/(app)/actions/settings";

export function AllowSavingToggle({ defaultChecked }: { defaultChecked: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Niente <form action>: dopo l'azione React chiama form.reset(), che riporta una checkbox
  // all'attributo iniziale anche se è controllata, e l'interruttore tornerebbe indietro.
  function toggle(next: boolean) {
    setChecked(next);
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      if (next) formData.set("allowSaving", "on");
      const result = await setAllowSavingAction(formData);
      if ("error" in result) {
        setChecked(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
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
    </div>
  );
}
