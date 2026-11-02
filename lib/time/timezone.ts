export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
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
