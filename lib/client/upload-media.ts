import { confirmUploadAction, requestUploadAction } from "@/app/(app)/actions/media";
import { baseMime } from "@/lib/lanterns/media";

export type UploadOutcome =
  | { kind: "sent"; revealAt: string }
  | { kind: "network" }
  | { kind: "rejected"; message: string };

/** Chiede il permesso al server, carica il file sullo storage e conferma. */
export async function uploadMedia(input: {
  connectionId: string;
  type: "audio" | "photo";
  blob: Blob;
  durationSec?: number;
}): Promise<UploadOutcome> {
  const { connectionId, type, blob, durationSec } = input;
  const mime = baseMime(blob.type);
  try {
    const ticket = await requestUploadAction({ connectionId, type, mime, bytes: blob.size, durationSec });
    if ("error" in ticket) return { kind: "rejected", message: ticket.error };

    const upload = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: ticket.uploadHeaders,
      body: new Blob([blob], { type: mime }),
    });
    if (!upload.ok) return upload.status >= 500 ? { kind: "network" } : { kind: "rejected", message: "Questo file non si può inviare." };

    const confirmed = await confirmUploadAction({ connectionId, lanternId: ticket.lanternId });
    if ("error" in confirmed) return { kind: "rejected", message: confirmed.error };
    return { kind: "sent", revealAt: ticket.revealAt };
  } catch {
    // Una Server Action o un fetch che non arrivano a destinazione.
    return { kind: "network" };
  }
}
