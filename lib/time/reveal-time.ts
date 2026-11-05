import { TZDate } from "@date-fns/tz";

export type LocalDate = { year: number; month: number; day: number };

const TIME_RE = /^(\d{2}):(\d{2})$/;

export function parseRevealTime(s: string): { hour: number; minute: number } {
  const m = TIME_RE.exec(s);
  if (!m) throw new Error(`Orario non valido: ${s}`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error(`Orario non valido: ${s}`);
  return { hour, minute };
}

/** Consentito dalle 17:00 alle 00:00 comprese. */
export function isAllowedRevealTime(s: string): boolean {
  try {
    const { hour, minute } = parseRevealTime(s);
    const minutes = hour * 60 + minute;
    return minutes >= 17 * 60 || minutes === 0;
  } catch {
    return false;
  }
}

export function localDateOf(at: Date, tz: string): LocalDate {
  const d = new TZDate(at.getTime(), tz);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/** Il giorno è normalizzato, quindi `day` può uscire dal mese (es. 32 → giorno 1 del mese dopo). */
export function localInstant(localDate: LocalDate, time: string, tz: string): Date {
  const { hour, minute } = parseRevealTime(time);
  const d = new TZDate(localDate.year, localDate.month - 1, localDate.day, hour, minute, tz);
  return new Date(d.getTime());
}

export function addLocalDays(localDate: LocalDate, days: number): LocalDate {
  return { ...localDate, day: localDate.day + days };
}

export function sameLocalDate(a: LocalDate, b: LocalDate): boolean {
  const da = Date.UTC(a.year, a.month - 1, a.day);
  const db = Date.UTC(b.year, b.month - 1, b.day);
  return da === db;
}

/**
 * Istante dell'apertura della sera `evening`: mezzanotte appartiene alla sera precedente,
 * quindi cade nel giorno di calendario successivo.
 */
export function eveningInstant(evening: LocalDate, time: string, tz: string): Date {
  return localInstant(time === "00:00" ? addLocalDays(evening, 1) : evening, time, tz);
}

/** Primo istante strettamente successivo ad `after`, scegliendo l'orario sera per sera. */
export function firstOccurrenceAfter(timeForEvening: (evening: LocalDate) => string, tz: string, after: Date): Date {
  const today = localDateOf(after, tz);
  for (const offset of [-1, 0, 1]) {
    const evening = addLocalDays(today, offset);
    const candidate = eveningInstant(evening, timeForEvening(evening), tz);
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  throw new Error("Nessuna occorrenza trovata: orario fuori dall'intervallo consentito?");
}

export function nextOccurrence(time: string, tz: string, after: Date): Date {
  return firstOccurrenceAfter(() => time, tz, after);
}

export function previousOccurrence(time: string, tz: string, atOrBefore: Date): Date {
  const today = localDateOf(atOrBefore, tz);
  for (const offset of [0, -1]) {
    const candidate = eveningInstant(addLocalDays(today, offset), time, tz);
    if (candidate.getTime() <= atOrBefore.getTime()) return candidate;
  }
  throw new Error("Nessuna occorrenza trovata: orario fuori dall'intervallo consentito?");
}

/** Gli orari che si possono scegliere nei form: ogni 15 minuti, più la mezzanotte. */
export function revealTimeOptions(): { value: string; label: string }[] {
  const options = [];
  for (let hour = 17; hour < 24; hour++) {
    for (const minute of [0, 15, 30, 45]) {
      const value = `${hour}:${String(minute).padStart(2, "0")}`;
      options.push({ value, label: value });
    }
  }
  return [...options, { value: "00:00", label: "mezzanotte" }];
}
