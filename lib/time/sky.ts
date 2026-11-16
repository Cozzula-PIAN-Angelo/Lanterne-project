import SunCalc from "suncalc";
import { localDateOf, localInstant, nextOccurrence } from "./reveal-time";

export type SkyPhase = "day" | "sunset" | "dusk" | "night";
export type SkyLocation = { lat: number; lng: number };

export type SkyInput = {
  now: Date;
  tz: string;
  lastArrivalAt: Date | null;
  nextArrivalAt: Date | null;
  location?: SkyLocation | null;
};

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** La notte dura dall'apertura fino alle 06:00 locali. */
function nightEnd(tz: string, lastArrivalAt: Date): Date {
  return nextOccurrence("06:00", tz, lastArrivalAt);
}

const isValid = (d: Date) => !Number.isNaN(d.getTime());

/**
 * Soglie del tramonto prima di `nextArrivalAt`: `sunset` è l'inizio della fase "sunset",
 * `dusk` quello del crepuscolo (null senza posizione). Il tramonto reale vale solo se
 * esiste (non al sole di mezzanotte) e precede l'apertura; altrimenti si parte un'ora prima.
 */
function thresholds(tz: string, nextArrivalAt: Date, location?: SkyLocation | null): { sunset: Date; dusk: Date | null } {
  if (location) {
    const noon = localInstant(localDateOf(new Date(nextArrivalAt.getTime() - MINUTE), tz), "12:00", tz);
    const times = SunCalc.getTimes(noon, location.lat, location.lng);
    if (isValid(times.goldenHour) && isValid(times.sunset) && times.sunset.getTime() < nextArrivalAt.getTime()) {
      return { sunset: times.goldenHour, dusk: times.sunset };
    }
  }
  return { sunset: new Date(nextArrivalAt.getTime() - HOUR), dusk: null };
}

export function skyPhase(input: SkyInput): SkyPhase {
  const { now, tz, lastArrivalAt, nextArrivalAt, location } = input;
  if (lastArrivalAt && lastArrivalAt.getTime() <= now.getTime() && now.getTime() < nightEnd(tz, lastArrivalAt).getTime()) {
    return "night";
  }
  if (!nextArrivalAt) return "day";
  const { sunset, dusk } = thresholds(tz, nextArrivalAt, location);
  if (dusk && now.getTime() >= dusk.getTime()) return "dusk";
  if (now.getTime() >= sunset.getTime()) return "sunset";
  return "day";
}

/** Una propria lanterna si accende un'ora prima della partenza. */
export function isLanternLit(now: Date, departureAt: Date): boolean {
  return now.getTime() >= departureAt.getTime() - HOUR;
}

/** Il primo istante dopo `now` in cui cambia la fase o si accende o parte una propria lanterna. */
export function nextSkyChange(input: SkyInput, departures: Date[]): Date | null {
  const { now, tz, lastArrivalAt, nextArrivalAt, location } = input;
  const candidates: Date[] = [];
  if (lastArrivalAt) candidates.push(nightEnd(tz, lastArrivalAt));
  if (nextArrivalAt) {
    const { sunset, dusk } = thresholds(tz, nextArrivalAt, location);
    candidates.push(sunset, nextArrivalAt);
    if (dusk) candidates.push(dusk);
  }
  for (const departure of departures) {
    candidates.push(new Date(departure.getTime() - HOUR), departure);
  }
  let best: Date | null = null;
  for (const c of candidates) {
    if (c.getTime() > now.getTime() && (!best || c.getTime() < best.getTime())) best = c;
  }
  return best;
}
