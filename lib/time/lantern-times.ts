import { firstOccurrenceAfter, localDateOf, sameLocalDate } from "./reveal-time";

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
