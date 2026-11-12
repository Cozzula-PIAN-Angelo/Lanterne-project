import { openDB, type DBSchema } from "idb";
import type { OutboxItem, OutboxStore } from "./outbox";

interface OutboxDb extends DBSchema {
  items: { key: string; value: OutboxItem; indexes: { userId: string } };
}

function openOutbox() {
  return openDB<OutboxDb>("lanterne-outbox", 1, {
    upgrade(db) {
      db.createObjectStore("items", { keyPath: "id" }).createIndex("userId", "userId");
    },
  });
}

/** Dove IndexedDB manca o rifiuta il file: vale finché la pagina resta aperta, e l'interfaccia lo dice. */
const memory = new Map<string, OutboxItem>();

export const outboxStore: OutboxStore = {
  async list(userId) {
    const held = [...memory.values()].filter((item) => item.userId === userId);
    try {
      const db = await openOutbox();
      const saved = await db.getAllFromIndex("items", "userId", userId);
      db.close();
      return [...saved, ...held];
    } catch {
      return held;
    }
  },
  async put(item) {
    if (!memory.has(item.id)) {
      try {
        const db = await openOutbox();
        await db.put("items", item);
        db.close();
        return;
      } catch {
        // Si tiene in memoria, qui sotto.
      }
    }
    memory.set(item.id, item);
  },
  async remove(id) {
    if (memory.delete(id)) return;
    const db = await openOutbox();
    await db.delete("items", id);
    db.close();
  },
  async clear(userId) {
    for (const item of memory.values()) if (item.userId === userId) memory.delete(item.id);
    try {
      const db = await openOutbox();
      const keys = await db.getAllKeysFromIndex("items", "userId", userId);
      await Promise.all(keys.map((key) => db.delete("items", key)));
      db.close();
    } catch {
      // Senza IndexedDB non c'è niente da togliere.
    }
  },
};

export function isHeldInMemory(id: string) {
  return memory.has(id);
}

export const OUTBOX_CHANGED = "lanterne:outbox-changed";

/** Mette in coda e avvisa il pannello, che si occupa dell'invio. Non perde mai il file in silenzio. */
export async function enqueue(input: Omit<OutboxItem, "id" | "status">) {
  // L'indice restituisce gli elementi in ordine di chiave: chi è registrato prima parte prima.
  const id = `${String(Date.now()).padStart(15, "0")}-${crypto.randomUUID()}`;
  await outboxStore.put({ ...input, id, status: "waiting" });
  window.dispatchEvent(new Event(OUTBOX_CHANGED));
}
