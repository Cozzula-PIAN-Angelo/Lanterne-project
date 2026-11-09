import { expect, test, vi } from "vitest";
import { flushOutbox, retryDelayMs, type OutboxItem, type OutboxStore } from "./outbox";
import type { UploadOutcome } from "./upload-media";

test("i tentativi automatici si diradano fino a due minuti", () => {
  expect([0, 1, 2, 3, 50].map(retryDelayMs)).toEqual([5_000, 30_000, 120_000, 120_000, 120_000]);
});

const EXPECTED = "2026-11-03T02:30:00.000Z";
const NEXT_EVENING = "2026-11-04T02:30:00.000Z";

function item(over: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: "a",
    userId: "pia",
    connectionId: "c1",
    type: "audio",
    blob: new Blob(["voce"], { type: "audio/webm" }),
    durationSec: 3,
    expectedRevealAt: EXPECTED,
    status: "waiting",
    ...over,
  };
}

function memoryStore(initial: OutboxItem[]) {
  const items = new Map(initial.map((i) => [i.id, i]));
  const store: OutboxStore = {
    list: async (userId) => [...items.values()].filter((i) => i.userId === userId),
    put: async (i) => void items.set(i.id, i),
    remove: async (id) => void items.delete(id),
    clear: async (userId) => {
      for (const i of items.values()) if (i.userId === userId) items.delete(i.id);
    },
  };
  return { items, store };
}

const sent = (revealAt = EXPECTED): UploadOutcome => ({ kind: "sent", revealAt });

test("un invio riuscito toglie l'elemento", async () => {
  const { items, store } = memoryStore([item()]);
  const upload = vi.fn(async () => sent());

  const result = await flushOutbox(store, "pia", upload);

  expect(result.sent).toEqual([{ id: "a", late: false }]);
  expect(items.size).toBe(0);
  expect(upload).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "c1", type: "audio", durationSec: 3, blob: expect.any(Blob) }),
  );
});

test("un errore di rete lascia l'elemento in attesa e ferma il giro", async () => {
  const { items, store } = memoryStore([item({ id: "a" }), item({ id: "b" })]);
  const upload = vi.fn(async (): Promise<UploadOutcome> => ({ kind: "network" }));

  const result = await flushOutbox(store, "pia", upload);

  expect(result.sent).toEqual([]);
  expect(upload).toHaveBeenCalledTimes(1);
  expect([...items.values()].map((i) => i.status)).toEqual(["waiting", "waiting"]);
});

test("un rifiuto segna rejected con il messaggio e non riprova da solo", async () => {
  const { items, store } = memoryStore([item({ id: "a" }), item({ id: "b" })]);
  const upload = vi.fn(
    async (): Promise<UploadOutcome> => ({ kind: "rejected", message: "Questa connessione non c'è più." }),
  );

  await flushOutbox(store, "pia", upload);
  // Un rifiuto non ferma il giro: gli altri elementi possono andare a persone diverse.
  expect(upload).toHaveBeenCalledTimes(2);
  expect(items.get("a")).toMatchObject({ status: "rejected", message: "Questa connessione non c'è più." });

  await flushOutbox(store, "pia", upload);
  expect(upload).toHaveBeenCalledTimes(2);
});

test("late è true se revealAt supera expectedRevealAt", async () => {
  const { store } = memoryStore([item()]);
  const result = await flushOutbox(store, "pia", async () => sent(NEXT_EVENING));
  expect(result.sent).toEqual([{ id: "a", late: true }]);
});

test("due flush simultanei non inviano due volte", async () => {
  const { store } = memoryStore([item()]);
  const upload = vi.fn(async () => sent());

  await Promise.all([flushOutbox(store, "pia", upload), flushOutbox(store, "pia", upload)]);

  expect(upload).toHaveBeenCalledTimes(1);
});

test("se il file è già caricato ripete solo la conferma, senza creare una seconda lanterna", async () => {
  const { items, store } = memoryStore([item()]);
  const ticket = { lanternId: "l1", revealAt: EXPECTED };
  // Il file è arrivato, ma la risposta alla conferma si è persa.
  const lost = vi.fn<typeof import("./upload-media").uploadMedia>(async (input) => {
    await input.onUploaded?.(ticket);
    return { kind: "network" };
  });
  await flushOutbox(store, "pia", lost);
  expect(items.get("a")?.uploaded).toEqual(ticket);

  const upload = vi.fn<typeof import("./upload-media").uploadMedia>(async () => sent());
  await flushOutbox(store, "pia", upload);

  expect(upload).toHaveBeenCalledTimes(1);
  expect(upload.mock.calls[0][0].uploaded).toEqual(ticket);
  expect(items.size).toBe(0);
});

test("se la conferma ripetuta è rifiutata riparte da capo: la pulizia può aver tolto il caricamento", async () => {
  const ticket = { lanternId: "l1", revealAt: EXPECTED };
  const { items, store } = memoryStore([item({ uploaded: ticket })]);
  const upload = vi.fn<typeof import("./upload-media").uploadMedia>(async (input) =>
    input.uploaded ? { kind: "rejected", message: "Questa connessione non c'è più." } : sent(),
  );

  const result = await flushOutbox(store, "pia", upload);

  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[1][0].uploaded).toBeUndefined();
  expect(result.sent).toEqual([{ id: "a", late: false }]);
  expect(items.size).toBe(0);
});

test("legge solo gli elementi dell'utente corrente", async () => {
  const { items, store } = memoryStore([item({ id: "mia" }), item({ id: "altrui", userId: "marco" })]);
  const upload = vi.fn(async () => sent());

  const result = await flushOutbox(store, "pia", upload);

  expect(upload).toHaveBeenCalledTimes(1);
  expect(result.sent.map((s) => s.id)).toEqual(["mia"]);
  expect([...items.keys()]).toEqual(["altrui"]);
});
