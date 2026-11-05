// Nomi IANA come "Europe/Rome" o "America/Argentina/Buenos_Aires", più "UTC".
// Esclude offset fissi ("+01:00"), abbreviazioni ("EST") e minuscole ("europe/rome").
const IANA_NAME = /^(UTC|[A-Z][A-Za-z]+(\/[A-Z][A-Za-z0-9_+-]*)+)$/;

export function isValidTimeZone(tz: string): boolean {
  if (!IANA_NAME.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "America/New_York" → "New York" */
export function cityFromTimeZone(tz: string): string {
  return (tz.split("/").pop() ?? tz).replaceAll("_", " ");
}
