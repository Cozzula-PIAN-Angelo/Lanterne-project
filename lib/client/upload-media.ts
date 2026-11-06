import { confirmUploadAction, requestUploadAction } from "@/app/(app)/actions/media";
import { baseMime } from "@/lib/lanterns/media";

export type UploadOutcome =
  | { kind: "sent"; revealAt: string }
  | { kind: "network" }
  | { kind: "rejected"; message: string };

export type UploadedTicket = { lanternId: string; revealAt: string };

/** 25 MB in 10 minuti sono circa 330 kbit/s: oltre non è una rete lenta, è un caricamento bloccato. */
export const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

async function putFile(url: string, headers: Record<string, string>, body: Blob): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    return await fetch(url, { method: "PUT", headers, body, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chiede il permesso al server, carica il file sullo storage e conferma.
 * Con `uploaded` il file è già arrivato e si ripete solo la conferma, che è idempotente.
 */
export async function uploadMedia(input: {
  connectionId: string;
  type: "audio" | "photo";
  blob: Blob;
  durationSec?: number;
  uploaded?: UploadedTicket;
  onUploaded?: (ticket: UploadedTicket) => Promise<void>;
}): Promise<UploadOutcome> {
  const { connectionId, type, blob, durationSec } = input;
  const mime = baseMime(blob.type);
  try {
    let ticket = input.uploaded;
    if (!ticket) {
      const granted = await requestUploadAction({ connectionId, type, mime, bytes: blob.size, durationSec });
      if ("error" in granted) return { kind: "rejected", message: granted.error };

      const upload = await putFile(granted.uploadUrl, granted.uploadHeaders, new Blob([blob], { type: mime }));
      if (!upload.ok) return upload.status >= 500 ? { kind: "network" } : { kind: "rejected", message: "Questo file non si può inviare." };

      ticket = { lanternId: granted.lanternId, revealAt: granted.revealAt };
      await input.onUploaded?.(ticket);
    }

    const confirmed = await confirmUploadAction({ connectionId, lanternId: ticket.lanternId });
    if ("error" in confirmed) return { kind: "rejected", message: confirmed.error };
    return { kind: "sent", revealAt: ticket.revealAt };
  } catch {
    // Una Server Action o un fetch che non arrivano a destinazione.
    return { kind: "network" };
  }
}
