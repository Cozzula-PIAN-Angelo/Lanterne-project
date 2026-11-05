"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { updateTimezoneAction } from "@/app/(app)/actions/settings";
import { Button } from "@/components/ui/button";
import { cityFromTimeZone } from "@/lib/time/timezone";

const subscribe = () => () => {};
const readDeviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const dismissedKey = (tz: string) => `lanterne-tz-dismissed:${tz}`;

// localStorage può non esserci (navigazione privata, dati bloccati): il banner funziona lo stesso.
function readDismissed(tz: string): boolean {
  try {
    return localStorage.getItem(dismissedKey(tz)) !== null;
  } catch {
    return false;
  }
}

function rememberDismissed(tz: string) {
  try {
    localStorage.setItem(dismissedKey(tz), "1");
  } catch {}
}

export function TimezoneBanner({ userTz }: { userTz: string }) {
  const deviceTz = useSyncExternalStore(subscribe, readDeviceTz, () => null);
  const storedDismissed = useSyncExternalStore(
    subscribe,
    () => deviceTz !== null && readDismissed(deviceTz),
    () => false,
  );
  const [closed, setClosed] = useState(false);
  const [error, formAction, pending] = useActionState(async (_prev: string | null, formData: FormData) => {
    const result = await updateTimezoneAction(formData);
    return "error" in result ? result.error : null;
  }, null);

  if (!deviceTz || deviceTz === userTz || closed || storedDismissed) return null;

  return (
    <aside className="mb-4 space-y-2 rounded-xl border p-3">
      <p className="text-sm">Sei a {cityFromTimeZone(deviceTz)}? Aggiorno il tuo fuso orario?</p>
      <div className="flex gap-2">
        <form action={formAction}>
          <input type="hidden" name="timezone" value={deviceTz} />
          <Button type="submit" size="sm" disabled={pending}>
            Sì
          </Button>
        </form>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            rememberDismissed(deviceTz);
            setClosed(true);
          }}
        >
          No
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </aside>
  );
}
