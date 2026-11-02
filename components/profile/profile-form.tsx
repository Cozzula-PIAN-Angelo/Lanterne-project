"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { updateProfileAction } from "@/app/(app)/actions/profile";
import { Button } from "@/components/ui/button";
import type { AccessResult } from "@/lib/access/errors";
import { COLORS } from "@/lib/lanterns/constants";

type Props = { defaultName: string; defaultColor: string | null };

type DeviceZones = { local: string; all: string[] };
const NO_ZONES: DeviceZones = { local: "", all: [] };
let deviceZones: DeviceZones | undefined;

// Fuso e lista dipendono dal dispositivo: si leggono solo nel browser.
function readDeviceZones(): DeviceZones {
  if (!deviceZones) {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const all = Intl.supportedValuesOf("timeZone");
    deviceZones = { local, all: all.includes(local) ? all : [local, ...all] };
  }
  return deviceZones;
}
const subscribe = () => () => {};

export function ProfileForm({ defaultName, defaultColor }: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: AccessResult<void> | null, formData: FormData) => updateProfileAction(formData),
    null,
  );
  const [color, setColor] = useState(defaultColor ?? COLORS[0].hex);
  const zones = useSyncExternalStore(subscribe, readDeviceZones, () => NO_ZONES);
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  const timezone = chosenZone ?? zones.local;

  return (
    <form action={formAction} className="space-y-6">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Nome</span>
        <input
          name="name"
          required
          maxLength={40}
          defaultValue={defaultName}
          className="w-full rounded-lg border px-3 py-2"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Colore</legend>
        <div className="flex flex-wrap gap-3">
          {COLORS.map((c) => (
            <label key={c.id} className="cursor-pointer">
              <input
                type="radio"
                name="color"
                value={c.hex}
                checked={color === c.hex}
                onChange={() => setColor(c.hex)}
                className="peer sr-only"
                aria-label={c.id}
              />
              <span
                className="block size-10 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2"
                style={{ backgroundColor: c.hex }}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Fuso orario</span>
        <select
          name="timezone"
          required
          value={timezone}
          onChange={(e) => setChosenZone(e.target.value)}
          className="w-full rounded-lg border px-3 py-2"
        >
          {zones.all.map((z) => (
            <option key={z} value={z}>
              {z.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>

      {state && !state.ok && (
        <p role="alert" className="text-sm text-destructive">
          Qualcosa non torna: controlla nome, colore e fuso orario.
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending || !timezone} className="w-full">
        Continua
      </Button>
    </form>
  );
}
