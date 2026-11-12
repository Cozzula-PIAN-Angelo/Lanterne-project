import type { AccessErrorCode } from "@/lib/access/errors";

/** Esito di una Server Action, per i form: un errore da mostrare o dove andare. */
export type ActionResult = { error: string } | { redirectTo: string };

const MESSAGES: Partial<Record<AccessErrorCode, string>> = {
  invite_invalid: "Questo invito non è valido.",
  invite_expired: "Questo invito è scaduto. Chiedi a chi te l'ha mandato di crearne uno nuovo.",
  invite_used: "Questo invito è già stato usato.",
  self_invite: "Questo è un tuo invito: mandalo alla persona con cui vuoi collegarti.",
  already_connected: "Siete già collegati.",
  connection_limit_self: "Hai già 5 persone collegate: per aggiungerne una, chiudi prima una connessione.",
  connection_limit_other: "Questa persona ha già 5 connessioni.",
  connection_not_active: "Prima dovete mettervi d'accordo sull'orario.",
  too_late: "Questa lanterna è già partita.",
  not_savable: "Chi l'ha inviata ha scelto di non farla conservare.",
  rate_limited: "Piano piano: riprova tra qualche minuto.",
  invalid_reveal_time: "Scegli un orario tra le 17:00 e mezzanotte.",
  audio_cap_reached: "Per oggi il lago è pieno.",
  upload_missing: "Il file non è arrivato, riproviamo.",
  upload_invalid: "Questo file non si può inviare.",
};

const FALLBACK = "Qualcosa non è andato, riproviamo tra poco.";

export function errorMessage(code: AccessErrorCode): string {
  return MESSAGES[code] ?? FALLBACK;
}

/**
 * Per chi sta inviando, `not_found` vuol dire che la connessione non esiste più, per esempio
 * perché l'altra persona ha eliminato l'account: riprovare non servirebbe.
 */
export function sendErrorMessage(code: AccessErrorCode): string {
  return code === "not_found" ? "Questa connessione non c'è più." : errorMessage(code);
}
