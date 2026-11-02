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
