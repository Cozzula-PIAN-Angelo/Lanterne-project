import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { addLocalDays, localDateOf, sameLocalDate } from "./reveal-time";

function localTime(at: Date, tz: string): string {
  return format(new TZDate(at.getTime(), tz), "H:mm");
}

/** "alle 21:30", oppure "a mezzanotte" */
function atTime(at: Date, tz: string): string {
  const time = localTime(at, tz);
  return time === "0:00" ? "a mezzanotte" : `alle ${time}`;
}

/**
 * "stasera alle 21:30", "oggi alle 15:30", "stanotte alle 3:30", "stanotte a mezzanotte",
 * "domani alle 21:30", "il 5 novembre a mezzanotte". La parola segue l'ora locale di chi guarda.
 */
export function formatRevealLabel(revealAt: Date, viewerTz: string, now: Date): string {
  const day = localDateOf(revealAt, viewerTz);
  const today = localDateOf(now, viewerTz);
  const hour = new TZDate(revealAt.getTime(), viewerTz).getHours();
  const at = atTime(revealAt, viewerTz);
  if (sameLocalDate(day, today)) {
    if (hour < 5) return `stanotte ${at}`;
    return hour < 17 ? `oggi ${at}` : `stasera ${at}`;
  }
  if (sameLocalDate(day, addLocalDays(today, 1)) && hour < 5) return `stanotte ${at}`;
  if (sameLocalDate(day, addLocalDays(today, 1))) return `domani ${at}`;
  return `il ${format(new TZDate(revealAt.getTime(), viewerTz), "d MMMM", { locale: it })} ${at}`;
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
  if (theirs === localTime(revealAt, viewerTz)) return label;
  return theirs === "0:00" ? `${label}, la mezzanotte di ${recipientName}` : `${label}, le ${theirs} di ${recipientName}`;
}

export function formatCountdown(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "tra meno di un minuto";
  if (minutes < 60) return minutes === 1 ? "tra 1 minuto" : `tra ${minutes} minuti`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "tra 1 ora" : `tra ${hours} ore`;
}

/** "alle 21:30" o "a mezzanotte", per un orario `HH:MM` non ancora legato a un giorno. */
export function atRevealTime(time: string): string {
  return time === "00:00" ? "a mezzanotte" : `alle ${time}`;
}

/** "delle 21:30" o "di mezzanotte". */
export function ofRevealTime(time: string): string {
  return time === "00:00" ? "di mezzanotte" : `delle ${time}`;
}
