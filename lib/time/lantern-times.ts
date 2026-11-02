import { firstOccurrenceAfter, localDateOf, nextOccurrence, sameLocalDate } from "./reveal-time";

export type RevealSchedule = {
  revealTime: string;
  previousRevealTime: string | null;
  revealTimeChangedAt: Date | null;
};

/**
 * Prossimo arrivo nel fuso del destinatario. Un cambio d'orario vale dal giorno dopo:
 * nel giorno locale del cambio si usa ancora l'orario precedente.
 */
export function computeRevealAt(schedule: RevealSchedule, recipientTz: string, now: Date): Date {
  const changeDay = schedule.revealTimeChangedAt ? localDateOf(schedule.revealTimeChangedAt, recipientTz) : null;
  return firstOccurrenceAfter(
    (day) =>
      changeDay && schedule.previousRevealTime && sameLocalDate(day, changeDay)
        ? schedule.previousRevealTime
        : schedule.revealTime,
    recipientTz,
    now,
  );
}

const MIN_VISIBLE_MS = 8 * 60 * 60 * 1000;

/** Le 06:00 del destinatario dopo l'arrivo, ma mai meno di 8 ore di visibilità. */
export function computeExpiresAt(revealAt: Date, recipientTz: string): Date {
  const morning = nextOccurrence("06:00", recipientTz, revealAt);
  return new Date(Math.max(morning.getTime(), revealAt.getTime() + MIN_VISIBLE_MS));
}
