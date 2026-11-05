export interface Clock {
  now(): Date;
}

export const DEV_OFFSET_COOKIE = "lanterne-dev-offset";

export const systemClock: Clock = {
  now: () => new Date(),
};

export function fixedClock(at: Date): Clock {
  return { now: () => new Date(at.getTime()) };
}

export function offsetClock(base: Clock, offsetMs: number): Clock {
  return { now: () => new Date(base.now().getTime() + offsetMs) };
}

/** Offset del pannello "viaggio nel tempo": attivo solo in development. */
export function parseDevOffset(raw: string | undefined, nodeEnv: string | undefined): number {
  if (nodeEnv !== "development" || raw === undefined) return 0;
  const ms = Number(raw);
  return Number.isFinite(ms) ? ms : 0;
}

/** Il valore del cookie del viaggio nel tempo. Fuori dallo sviluppo si rifiuta di produrlo. */
export function devOffsetCookieValue(ms: number, nodeEnv: string | undefined): string {
  if (nodeEnv !== "development") throw new Error("Il viaggio nel tempo esiste solo in sviluppo.");
  if (!Number.isFinite(ms)) throw new Error("Spostamento dell'orologio non valido.");
  return String(ms);
}
