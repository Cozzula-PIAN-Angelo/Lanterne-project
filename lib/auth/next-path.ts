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
    if (url.origin !== PROBE_ORIGIN) return null;
    // Dopo la normalizzazione, "/..//evil" diventa "//evil": un percorso così porterebbe fuori dal sito.
    return url.pathname.startsWith("//") ? null : `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
