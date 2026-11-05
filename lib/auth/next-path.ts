const PROBE_ORIGIN = "http://lanterne.invalid";

/**
 * Il percorso interno a cui tornare dopo login e onboarding, o null.
 * Arriva dall'URL: senza questo controllo un link potrebbe portare fuori dal sito (open redirect).
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.includes("\\")) return null;
  try {
    // Il parser è lo stesso del browser: "/\t/evil" diventa "//evil" e cambia origine.
    const url = new URL(raw, PROBE_ORIGIN);
    return url.origin === PROBE_ORIGIN ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}
