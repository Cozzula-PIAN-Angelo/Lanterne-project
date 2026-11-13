"use client";

import { useState, useSyncExternalStore } from "react";
import { clearSkyLocation, readSkyLocationRaw, saveSkyLocation, SKY_LOCATION_CHANGED } from "@/lib/client/sky-location";

function subscribe(onChange: () => void) {
  window.addEventListener(SKY_LOCATION_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SKY_LOCATION_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const NO_CHANGE = () => () => {};

const MESSAGES = {
  saved: "Fatto: ora il cielo segue il tramonto vero.",
  denied: "Il browser non dà la posizione: il cielo segue l'orario di apertura.",
} as const;

/** La posizione resta sul dispositivo, arrotondata: serve solo a far tramontare il sole sul lago alla sua ora. */
export function SkyLocationToggle() {
  const on = useSyncExternalStore(
    subscribe,
    () => readSkyLocationRaw() !== null,
    () => false,
  );
  // Finché la pagina non è idratata un tocco andrebbe perso: l'interruttore resta spento e disabilitato.
  const ready = useSyncExternalStore(NO_CHANGE, () => true, () => false);
  const [message, setMessage] = useState<keyof typeof MESSAGES | null>(null);
  const [pending, setPending] = useState(false);

  function turnOn() {
    setMessage(null);
    if (!("geolocation" in navigator)) {
      setMessage("denied");
      return;
    }
    setPending(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        saveSkyLocation({ lat: coords.latitude, lng: coords.longitude });
        setMessage("saved");
        setPending(false);
      },
      () => {
        setMessage("denied");
        setPending(false);
      },
      { maximumAge: 60 * 60 * 1000, timeout: 15_000 },
    );
  }

  function turnOff() {
    setMessage(null);
    clearSkyLocation();
  }

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={on}
          disabled={pending || !ready}
          onChange={(e) => (e.target.checked ? turnOn() : turnOff())}
          className="size-5"
        />
        <span>Usa la mia posizione per il cielo</span>
      </label>
      <p className="text-sm text-muted-foreground">
        Il tramonto sul lago segue quello vero. La posizione resta su questo telefono, arrotondata a circa 10 km, e non viene mai inviata.
      </p>
      {message && (
        <p role="status" className="text-sm">
          {MESSAGES[message]}
        </p>
      )}
    </div>
  );
}
