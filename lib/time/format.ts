import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { addLocalDays, localDateOf, sameLocalDate } from "./reveal-time";

function localTime(at: Date, tz: string): string {
  return format(new TZDate(at.getTime(), tz), "H:mm");
}

/** "stasera alle 21:30", "stanotte a mezzanotte", "domani alle 21:30", "il 4 novembre alle 21:30" */
export function formatRevealLabel(revealAt: Date, viewerTz: string, now: Date): string {
  const day = localDateOf(revealAt, viewerTz);
  const today = localDateOf(now, viewerTz);
  const tomorrow = addLocalDays(today, 1);
  const time = localTime(revealAt, viewerTz);
  if (sameLocalDate(day, today)) return `stasera alle ${time}`;
  if (sameLocalDate(day, tomorrow)) return time === "0:00" ? "stanotte a mezzanotte" : `domani alle ${time}`;
  return `il ${format(new TZDate(revealAt.getTime(), viewerTz), "d MMMM", { locale: it })} alle ${time}`;
}

/** Partenza vista dal mittente, con l'ora del destinatario se i fusi differiscono. */
export function formatDepartureLabel(
  revealAt: Date,
  viewerTz: string,
  recipientTz: string,
  recipientName: string,
  now: Date,
): string {
  const label = `partono ${formatRevealLabel(revealAt, viewerTz, now)}`;
  const theirs = localTime(revealAt, recipientTz);
  return theirs === localTime(revealAt, viewerTz) ? label : `${label}, le ${theirs} di ${recipientName}`;
}

export function formatCountdown(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "tra meno di un minuto";
  if (minutes < 60) return minutes === 1 ? "tra 1 minuto" : `tra ${minutes} minuti`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "tra 1 ora" : `tra ${hours} ore`;
}
