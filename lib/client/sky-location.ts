import type { SkyLocation } from "@/lib/time/sky";

const KEY = "lanterne:sky-location";

/** Evento su `window` dopo ogni salvataggio o cancellazione, per chi mostra il cielo. */
export const SKY_LOCATION_CHANGED = "lanterne:sky-location-changed";

/** Un decimale, circa 10 km: basta per il tramonto e dice poco su dove si è. */
export function roundCoord(n: number): number {
  return Math.round(n * 10) / 10;
}

function defaultStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Legge e controlla il testo salvato: qualunque cosa strana vale "nessuna posizione". */
export function parseSkyLocation(raw: string | null): SkyLocation | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { lat?: unknown; lng?: unknown } | null;
    const { lat, lng } = value ?? {};
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/** Il testo grezzo salvato, o null. Serve a chi ha bisogno di uno snapshot stabile. */
export function readSkyLocationRaw(storage: Storage | null = defaultStorage()): string | null {
  try {
    return storage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function readSkyLocation(storage?: Storage): SkyLocation | null {
  return parseSkyLocation(readSkyLocationRaw(storage));
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SKY_LOCATION_CHANGED));
}

export function saveSkyLocation(loc: SkyLocation, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ lat: roundCoord(loc.lat), lng: roundCoord(loc.lng) }));
  } catch {
    // Storage bloccato: il cielo resta quello senza posizione.
  }
  notify();
}

export function clearSkyLocation(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Niente da togliere se non si può leggere.
  }
  notify();
}
