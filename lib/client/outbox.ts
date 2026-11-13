import type { uploadMedia, UploadedTicket, UploadOutcome } from "./upload-media";

export type OutboxItem = {
  id: string;
  userId: string;
  connectionId: string;
  type: "audio" | "photo";
  blob: Blob;
  durationSec?: number;
  expectedRevealAt: string;
  /** Quando è stato messo in coda (ISO). Manca negli elementi salvati prima del limite di età. */
  queuedAt?: string;
  /** Per chi è, perché le righe della coda non siano anonime. */
  partnerName?: string;
  status: "waiting" | "rejected";
  message?: string;
  /** Il file è già sullo storage: resta solo da confermare. */
  uploaded?: UploadedTicket;
};

export type OutboxStore = {
  list(userId: string): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<void>;
  remove(id: string): Promise<void>;
  clear(userId: string): Promise<void>;
};

type FlushResult = { sent: { id: string; late: boolean }[] };

/** Oltre un giorno la lanterna non ha più il senso di partire: meglio dirlo che mandarla settimane dopo. */
export const OUTBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

/**
 * L'attesa prima del prossimo tentativo automatico.
 * Ogni tentativo può riservare un vocale intero per 5 minuti: un ritmo più fitto farebbe scattare il tetto giornaliero.
 */
export function retryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

/**
 * Rilegge l'elemento dalla coda: la copia del pannello può essere vecchia,
 * e un'altra scheda può averlo già inviato. In quel caso non c'è niente da rimettere.
 */
export async function markForRetry(store: OutboxStore, userId: string, id: string): Promise<boolean> {
  const saved = (await store.list(userId)).find((item) => item.id === id);
  if (!saved) return false;
  await store.put({ ...saved, status: "waiting", message: undefined });
  return true;
}

async function deliver(store: OutboxStore, item: OutboxItem, upload: typeof uploadMedia): Promise<UploadOutcome> {
  const attempt = (current: OutboxItem) =>
    upload({
      connectionId: current.connectionId,
      type: current.type,
      blob: current.blob,
      durationSec: current.durationSec,
      uploaded: current.uploaded,
      // Salvato prima di confermare: se la risposta si perde, il giro dopo non crea un'altra lanterna.
      onUploaded: (ticket) => store.put({ ...current, uploaded: ticket }),
    });

  const outcome = await attempt(item);
  if (outcome.kind !== "rejected" || !item.uploaded) return outcome;

  // Dopo un'ora la pulizia toglie i caricamenti mai confermati: si riparte dal file.
  // Se il rifiuto era vero, la richiesta nuova lo ripete con il motivo giusto.
  const restarted = { ...item, uploaded: undefined };
  await store.put(restarted);
  return attempt(restarted);
}

async function drain(
  store: OutboxStore,
  userId: string,
  upload: typeof uploadMedia,
  nowMs: number,
): Promise<FlushResult> {
  const sent: FlushResult["sent"] = [];
  for (const item of await store.list(userId)) {
    if (item.status !== "waiting") continue;
    // Senza queuedAt (salvato prima di questo limite) si conta come appena accodato.
    if (item.queuedAt && nowMs - new Date(item.queuedAt).getTime() > OUTBOX_MAX_AGE_MS) {
      await store.put({
        ...item,
        uploaded: undefined,
        status: "rejected",
        message: "È rimasta in attesa più di un giorno e non è partita.",
      });
      continue;
    }
    const outcome = await deliver(store, item, upload);
    // Senza rete anche i successivi fallirebbero: si riprova tutti insieme al prossimo giro.
    if (outcome.kind === "network") break;
    if (outcome.kind === "rejected") {
      await store.put({ ...item, uploaded: undefined, status: "rejected", message: outcome.message });
      continue;
    }
    await store.remove(item.id);
    const late = new Date(outcome.revealAt).getTime() > new Date(item.expectedRevealAt).getTime();
    sent.push({ id: item.id, late });
  }
  return { sent };
}

const running = new Map<string, Promise<FlushResult>>();

/**
 * Un giro alla volta per utente: una chiamata durante un giro ne riceve l'esito.
 * Tra schede diverse decide il lock del browser: la seconda aspetta e rilegge la coda, già svuotata.
 */
export function flushOutbox(
  store: OutboxStore,
  userId: string,
  upload: typeof uploadMedia,
  nowMs: number,
): Promise<FlushResult> {
  const current = running.get(userId);
  if (current) return current;
  const work = () => drain(store, userId, upload, nowMs);
  const exclusive = async () => {
    const locks = globalThis.navigator?.locks;
    return locks ? await locks.request("lanterne-outbox", work) : await work();
  };
  const flush = exclusive().finally(() => running.delete(userId));
  running.set(userId, flush);
  return flush;
}

const KIND_LABEL = { audio: "Vocale", photo: "Foto" } as const;

/** Il testo della riga in coda: per chi è, e perché non è ancora partita. */
export function outboxRowLabel(
  item: Pick<OutboxItem, "type" | "status" | "partnerName">,
  state: { sending: boolean; online: boolean; failedOnce: boolean },
): string {
  const name = `${KIND_LABEL[item.type]}${item.partnerName ? ` per ${item.partnerName}` : ""}`;
  if (item.status !== "waiting") return name;
  if (state.sending) return `${name}: invio in corso…`;
  // Con la rete accesa e un tentativo fallito il problema è il server, non la rete.
  if (state.online && state.failedOnce) return `${name}: nuovo tentativo tra poco`;
  return `${name}: in attesa di rete`;
}
