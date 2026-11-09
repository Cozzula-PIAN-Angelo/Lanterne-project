import type { uploadMedia, UploadedTicket, UploadOutcome } from "./upload-media";

export type OutboxItem = {
  id: string;
  userId: string;
  connectionId: string;
  type: "audio" | "photo";
  blob: Blob;
  durationSec?: number;
  expectedRevealAt: string;
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

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

/**
 * L'attesa prima del prossimo tentativo automatico.
 * Ogni tentativo può riservare un vocale intero per 5 minuti: un ritmo più fitto farebbe scattare il tetto giornaliero.
 */
export function retryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
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

async function drain(store: OutboxStore, userId: string, upload: typeof uploadMedia): Promise<FlushResult> {
  const sent: FlushResult["sent"] = [];
  for (const item of await store.list(userId)) {
    if (item.status !== "waiting") continue;
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
export function flushOutbox(store: OutboxStore, userId: string, upload: typeof uploadMedia): Promise<FlushResult> {
  const current = running.get(userId);
  if (current) return current;
  const work = () => drain(store, userId, upload);
  const exclusive = async () => {
    const locks = globalThis.navigator?.locks;
    return locks ? await locks.request("lanterne-outbox", work) : await work();
  };
  const flush = exclusive().finally(() => running.delete(userId));
  running.set(userId, flush);
  return flush;
}
