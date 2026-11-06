import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { cleanupAbandoned, cleanupExpired, drainStorageDeletions } from "@/lib/access/cleanup";
import { getChannel } from "@/lib/access/lanterns";
import { getMediaUrl } from "@/lib/access/media";
import { lanterns, storageDeletions } from "@/lib/db/schema";
import { createStorage } from "@/lib/storage/s3";
import { getTestDb, makeConnection, makeLantern, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();
const storage = createStorage(process.env);
const now = new Date("2026-11-02T22:00:00Z");
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
const hours = (n: number) => minutes(n * 60);

beforeAll(() => storage.ensureBucket());
beforeEach(() => resetDb(db));

async function setup() {
  const giulia = await makeUser(db, { name: "Giulia", timezone: "Europe/Rome" });
  const marco = await makeUser(db, { name: "Marco", timezone: "America/New_York" });
  const conn = await makeConnection(db, giulia, marco);
  const lantern = (over: Partial<Parameters<typeof makeLantern>[1]> = {}) =>
    makeLantern(db, {
      connectionId: conn.id,
      senderId: giulia.id,
      recipientId: marco.id,
      revealAt: hours(-30),
      expiresAt: hours(-6),
      ...over,
    });
  return { giulia, marco, conn, lantern };
}

const rowOf = async (id: string) => (await db.select().from(lanterns).where(eq(lanterns.id, id)))[0];
const queuedKeys = async () => (await db.select().from(storageDeletions)).map((d) => d.key);

async function enqueue(...keys: string[]) {
  await db.insert(storageDeletions).values(keys.map((key) => ({ key, createdAt: hours(-2) })));
}

/** Uno storage che ricorda cosa gli è stato chiesto e sa fallire su una chiave. */
function fakeStorage(failing?: string) {
  const removed: string[] = [];
  return {
    removed,
    remove: async (key: string) => {
      if (key === failing) throw new Error("storage non raggiungibile");
      removed.push(key);
    },
  };
}

describe("cleanupExpired", () => {
  test("cleanupExpired elimina le scadute non conservate, di ogni tipo", async () => {
    const ctx = await setup();
    const text = await ctx.lantern();
    const thought = await ctx.lantern({ type: "thought", text: "ti-penso" });
    const key = `media/${randomUUID()}`;
    const audio = await ctx.lantern({
      type: "audio",
      text: null,
      mediaKey: key,
      mediaMime: "audio/mp4",
      mediaBytes: 4,
      durationSec: 3,
    });

    expect(await cleanupExpired(db, { now })).toEqual({ deleted: 3 });
    for (const { id } of [text, thought, audio]) expect(await rowOf(id)).toBeUndefined();
    expect(await queuedKeys()).toEqual([key]);
  });

  test("cleanupExpired conserva le salvate e quelle con expiresAt uguale a now", async () => {
    const ctx = await setup();
    const saved = await ctx.lantern({ savedAt: hours(-10) });
    const atTheEdge = await ctx.lantern({ expiresAt: now });

    expect(await cleanupExpired(db, { now })).toEqual({ deleted: 0 });
    expect(await rowOf(saved.id)).toBeDefined();
    expect(await rowOf(atTheEdge.id)).toBeDefined();
  });
});

describe("cleanupAbandoned", () => {
  test("cleanupAbandoned elimina le uploading create da più di un'ora, non quelle più recenti né le ready", async () => {
    const ctx = await setup();
    const future = { revealAt: hours(5), expiresAt: hours(29) };
    const key = `media/${randomUUID()}`;
    const abandoned = await ctx.lantern({
      ...future,
      type: "audio",
      text: null,
      status: "uploading",
      mediaKey: key,
      createdAt: minutes(-61),
    });
    const recent = await ctx.lantern({ ...future, status: "uploading", createdAt: minutes(-59) });
    const exactlyOneHour = await ctx.lantern({ ...future, status: "uploading", createdAt: minutes(-60) });
    const oldReady = await ctx.lantern({ ...future, createdAt: hours(-3) });

    expect(await cleanupAbandoned(db, { now })).toEqual({ deleted: 1 });
    expect(await rowOf(abandoned.id)).toBeUndefined();
    expect(await rowOf(recent.id)).toBeDefined();
    expect(await rowOf(exactlyOneHour.id)).toBeDefined();
    expect(await rowOf(oldReady.id)).toBeDefined();
    expect(await queuedKeys()).toEqual([key]);
  });
});

describe("drainStorageDeletions", () => {
  test("drain rimuove l'oggetto e poi la riga della coda", async () => {
    const key = `test/${randomUUID()}`;
    const { url, headers } = await storage.signUpload({ key, mime: "audio/mp4", bytes: 4 });
    await fetch(url, { method: "PUT", headers, body: new Uint8Array(4) });
    await enqueue(key);

    let rowsDuringRemove: string[] = [];
    const spying = {
      remove: async (k: string) => {
        rowsDuringRemove = await queuedKeys();
        await storage.remove(k);
      },
    };

    expect(await drainStorageDeletions(db, spying, { now })).toEqual({ removed: 1, failed: 0 });
    expect(rowsDuringRemove).toEqual([key]);
    expect(await storage.stat(key)).toBeNull();
    expect(await queuedKeys()).toEqual([]);
  });

  test("se remove fallisce la chiave resta in coda e le altre proseguono", async () => {
    await enqueue("media/a", "media/b", "media/c");
    const fake = fakeStorage("media/b");

    expect(await drainStorageDeletions(db, fake, { now })).toEqual({ removed: 2, failed: 1 });
    expect(fake.removed.sort()).toEqual(["media/a", "media/c"]);
    expect(await queuedKeys()).toEqual(["media/b"]);
  });

  test("drain rispetta limit; il default è 100", async () => {
    await enqueue(...Array.from({ length: 101 }, (_, i) => `media/${i}`));

    expect(await drainStorageDeletions(db, fakeStorage(), { now, limit: 2 })).toEqual({ removed: 2, failed: 0 });
    expect(await queuedKeys()).toHaveLength(99);

    await resetDb(db);
    await enqueue(...Array.from({ length: 101 }, (_, i) => `media/${i}`));
    expect(await drainStorageDeletions(db, fakeStorage(), { now })).toEqual({ removed: 100, failed: 0 });
    expect(await queuedKeys()).toHaveLength(1);
  });

  test("drain prende per prime le chiavi più vecchie", async () => {
    await db.insert(storageDeletions).values([
      { key: "media/recente", createdAt: hours(-2) },
      { key: "media/vecchia", createdAt: hours(-5) },
    ]);
    const fake = fakeStorage();

    await drainStorageDeletions(db, fake, { now, limit: 1 });
    expect(fake.removed).toEqual(["media/vecchia"]);
  });

  test("drain lascia in coda le chiavi accodate da meno di un'ora", async () => {
    await db.insert(storageDeletions).values([
      { key: "media/appena-accodata", createdAt: minutes(-59) },
      { key: "media/al-limite", createdAt: minutes(-60) },
    ]);
    const fake = fakeStorage();

    expect(await drainStorageDeletions(db, fake, { now })).toEqual({ removed: 1, failed: 0 });
    expect(fake.removed).toEqual(["media/al-limite"]);
    expect(await queuedKeys()).toEqual(["media/appena-accodata"]);
  });
});

describe("visibilità senza pulizia", () => {
  test("una lanterna già scaduta resta invisibile anche se la pulizia non è mai girata", async () => {
    const ctx = await setup();
    const audio = await ctx.lantern({
      type: "audio",
      text: null,
      mediaKey: `media/${randomUUID()}`,
      mediaMime: "audio/mp4",
      mediaBytes: 4,
      durationSec: 3,
    });

    const channel = await getChannel(db, { connectionId: ctx.conn.id, userId: ctx.marco.id, now });
    if (!channel.ok) throw new Error(channel.error);
    expect(channel.value.arrived).toEqual([]);
    expect(await getMediaUrl(db, storage, { lanternId: audio.id, userId: ctx.marco.id, now })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await rowOf(audio.id)).toBeDefined();
  });
});
