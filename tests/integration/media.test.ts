import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { endConnection } from "@/lib/access/connections";
import { deleteLantern, getChannel, saveLantern } from "@/lib/access/lanterns";
import { confirmMediaLantern, createMediaLantern, getMediaUrl, type MediaInput } from "@/lib/access/media";
import { connections, lanterns, rateLimits, storageDeletions, user } from "@/lib/db/schema";
import { AUDIO_MAX_BYTES, PHOTO_MAX_BYTES } from "@/lib/lanterns/media";
import { createStorage } from "@/lib/storage/s3";
import { getTestDb, makeConnection, makeLantern, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();
const storage = createStorage(process.env);
const now = new Date("2026-11-02T22:00:00Z"); // 23:00 a Roma, 17:00 a New York
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

beforeAll(() => storage.ensureBucket());
beforeEach(() => resetDb(db));

async function setup(overrides: { status?: "pending" | "ended" } = {}) {
  const giulia = await makeUser(db, { name: "Giulia", timezone: "Europe/Rome" });
  const marco = await makeUser(db, { name: "Marco", timezone: "America/New_York" });
  const conn = await makeConnection(db, giulia, marco, overrides);
  return { giulia, marco, conn };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const audioInput = ({ conn, giulia }: Setup, over: Partial<MediaInput> = {}): MediaInput => ({
  connectionId: conn.id,
  senderId: giulia.id,
  type: "audio",
  mime: "audio/mp4;codecs=opus",
  bytes: 4,
  durationSec: 60,
  now,
  ...over,
});

async function request(ctx: Setup, over: Partial<MediaInput> = {}) {
  const result = await createMediaLantern(db, storage, audioInput(ctx, over));
  if (!result.ok) throw new Error(`createMediaLantern: ${result.error}`);
  return result.value;
}

async function put(ticket: { uploadUrl: string; uploadHeaders: Record<string, string> }, size = 4) {
  const res = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: ticket.uploadHeaders,
    body: new Uint8Array(size).fill(1),
  });
  if (!res.ok) throw new Error(`upload: ${res.status}`);
}

async function ready(ctx: Setup, over: Partial<MediaInput> = {}) {
  const ticket = await request(ctx, over);
  await put(ticket);
  const confirmed = await confirmMediaLantern(db, storage, {
    lanternId: ticket.lanternId,
    userId: ctx.giulia.id,
  });
  expect(confirmed).toEqual({ ok: true, value: undefined });
  return ticket;
}

const rowOf = async (id: string) => (await db.select().from(lanterns).where(eq(lanterns.id, id)))[0];
const queued = async () => (await db.select().from(storageDeletions)).map((d) => d.key);

/** Una lanterna audio già presente, per riempire il tetto senza caricare file. */
async function existingAudio({ conn, giulia, marco }: Setup, durationSec: number, over = {}) {
  return makeLantern(db, {
    connectionId: conn.id,
    senderId: giulia.id,
    recipientId: marco.id,
    type: "audio",
    text: null,
    durationSec,
    revealAt: minutes(60),
    expiresAt: minutes(600),
    createdAt: now,
    ...over,
  });
}

describe("createMediaLantern", () => {
  test("il vocale nasce uploading e diventa ready solo dopo la conferma", async () => {
    const ctx = await setup();
    const ticket = await request(ctx);
    expect((await rowOf(ticket.lanternId)).status).toBe("uploading");
    await put(ticket);
    await confirmMediaLantern(db, storage, { lanternId: ticket.lanternId, userId: ctx.giulia.id });
    expect((await rowOf(ticket.lanternId)).status).toBe("ready");
  });

  test("arrivo e scadenza si calcolano alla creazione, nel fuso del destinatario", async () => {
    const ctx = await setup();
    const ticket = await request(ctx);
    const row = await rowOf(ticket.lanternId);
    expect(row.revealAt.toISOString()).toBe("2026-11-03T02:30:00.000Z");
    expect(row.expiresAt.toISOString()).toBe("2026-11-03T11:00:00.000Z");
    expect(ticket.revealAt.toISOString()).toBe("2026-11-03T02:30:00.000Z");
  });

  test("salva tipo senza parametri, savable del mittente e chiave casuale", async () => {
    const ctx = await setup();
    await db.update(user).set({ allowSaving: false }).where(eq(user.id, ctx.giulia.id));
    const row = await rowOf((await request(ctx)).lanternId);
    expect(row).toMatchObject({ mediaMime: "audio/mp4", mediaBytes: 4, durationSec: 60, savable: false });
    expect(row.mediaKey).toMatch(/^media\/[0-9a-f-]{36}$/);
  });

  test("rifiuta tipo, dimensione o durata fuori limite con invalid_input", async () => {
    const ctx = await setup();
    const bad: Partial<MediaInput>[] = [
      { bytes: AUDIO_MAX_BYTES + 1 },
      { bytes: 0 },
      { durationSec: 601 },
      { durationSec: 0 },
      { durationSec: undefined },
      { mime: "video/mp4" },
      { type: "photo", mime: "image/jpeg", bytes: PHOTO_MAX_BYTES + 1, durationSec: undefined },
      { type: "photo", mime: "audio/webm", durationSec: undefined },
    ];
    for (const over of bad) {
      expect(await createMediaLantern(db, storage, audioInput(ctx, over))).toEqual({
        ok: false,
        error: "invalid_input",
      });
    }
    expect(await db.select().from(lanterns)).toEqual([]);
  });

  test("accetta i limiti esatti: 10 minuti, 25 MB, foto da 10 MB", async () => {
    const ctx = await setup();
    await request(ctx, { durationSec: 600, bytes: AUDIO_MAX_BYTES });
    const photo = await request(ctx, {
      type: "photo",
      mime: "image/jpeg",
      bytes: PHOTO_MAX_BYTES,
      durationSec: undefined,
    });
    expect((await rowOf(photo.lanternId)).type).toBe("photo");
  });

  test("rifiuta su connessione pending o ended con connection_not_active", async () => {
    for (const status of ["pending", "ended"] as const) {
      await resetDb(db);
      const ctx = await setup({ status });
      expect(await createMediaLantern(db, storage, audioInput(ctx))).toEqual({
        ok: false,
        error: "connection_not_active",
      });
    }
  });

  test("un estraneo riceve not_found", async () => {
    const ctx = await setup();
    const sara = await makeUser(db);
    expect(await createMediaLantern(db, storage, audioInput(ctx, { senderId: sara.id }))).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  test("120 richieste all'ora, poi rate_limited", async () => {
    const ctx = await setup();
    await db
      .insert(rateLimits)
      .values({ key: `upload:${ctx.giulia.id}`, windowStart: now, count: 120 });
    expect(await createMediaLantern(db, storage, audioInput(ctx))).toEqual({
      ok: false,
      error: "rate_limited",
    });
  });
});

describe("tetto di 60 minuti di audio", () => {
  test("il tetto vale 60 minuti al giorno per connessione e mittente", async () => {
    const ctx = await setup();
    await existingAudio(ctx, 3100);
    expect(await createMediaLantern(db, storage, audioInput(ctx, { durationSec: 501 }))).toEqual({
      ok: false,
      error: "audio_cap_reached",
    });
    await request(ctx, { durationSec: 500 });
  });

  test("le foto non consumano il tetto", async () => {
    const ctx = await setup();
    await existingAudio(ctx, 3600);
    await request(ctx, { type: "photo", mime: "image/jpeg", durationSec: undefined });
  });

  test("il tetto riparte a mezzanotte del mittente", async () => {
    const ctx = await setup();
    await existingAudio(ctx, 3600);
    // 23:00 a Roma + 59 minuti: ancora lo stesso giorno
    const stillToday = audioInput(ctx, { now: minutes(59) });
    expect(await createMediaLantern(db, storage, stillToday)).toMatchObject({
      ok: false,
      error: "audio_cap_reached",
    });
    await request(ctx, { now: minutes(61) });
  });

  test("non conta gli altri mittenti né le altre connessioni", async () => {
    const ctx = await setup();
    await existingAudio(ctx, 3600, { senderId: ctx.marco.id, recipientId: ctx.giulia.id });
    const sara = await makeUser(db);
    const other = await makeConnection(db, ctx.giulia, sara);
    await existingAudio(ctx, 3600, { connectionId: other.id, recipientId: sara.id });
    await request(ctx);
  });

  test("una lanterna eliminata restituisce i suoi minuti", async () => {
    const ctx = await setup();
    const full = await existingAudio(ctx, 3600);
    await deleteLantern(db, { lanternId: full.id, userId: ctx.giulia.id, now });
    await request(ctx);
  });

  test("gli upload abbandonati da oltre 5 minuti non consumano il tetto", async () => {
    const ctx = await setup();
    await existingAudio(ctx, 3600, { status: "uploading", createdAt: minutes(-6) });
    await request(ctx);
    await resetDb(db);
    const fresh = await setup();
    await existingAudio(fresh, 3600, { status: "uploading", createdAt: minutes(-1) });
    expect(await createMediaLantern(db, storage, audioInput(fresh))).toMatchObject({
      ok: false,
      error: "audio_cap_reached",
    });
  });
});

describe("confirmMediaLantern", () => {
  test("confirm senza file: upload_missing, la lanterna resta uploading", async () => {
    const ctx = await setup();
    const ticket = await request(ctx);
    expect(
      await confirmMediaLantern(db, storage, { lanternId: ticket.lanternId, userId: ctx.giulia.id }),
    ).toEqual({ ok: false, error: "upload_missing" });
    expect((await rowOf(ticket.lanternId)).status).toBe("uploading");
  });

  test("confirm con dimensione o tipo diversi: upload_invalid, riga eliminata e chiave in coda", async () => {
    const ctx = await setup();
    const ticket = await request(ctx);
    const { mediaKey } = await rowOf(ticket.lanternId);
    // Lo storage rifiuterebbe il PUT firmato: si simula un oggetto arrivato comunque diverso.
    const other = await storage.signUpload({ key: mediaKey!, mime: "image/jpeg", bytes: 9 });
    await fetch(other.url, { method: "PUT", headers: other.headers, body: new Uint8Array(9) });

    expect(
      await confirmMediaLantern(db, storage, { lanternId: ticket.lanternId, userId: ctx.giulia.id }),
    ).toEqual({ ok: false, error: "upload_invalid" });
    expect(await rowOf(ticket.lanternId)).toBeUndefined();
    expect(await queued()).toEqual([mediaKey]);
  });

  test("confirm due volte è idempotente; un altro utente riceve not_found", async () => {
    const ctx = await setup();
    const ticket = await ready(ctx);
    expect(
      await confirmMediaLantern(db, storage, { lanternId: ticket.lanternId, userId: ctx.giulia.id }),
    ).toEqual({ ok: true, value: undefined });
    expect(
      await confirmMediaLantern(db, storage, { lanternId: ticket.lanternId, userId: ctx.marco.id }),
    ).toEqual({ ok: false, error: "not_found" });
  });

  test("connessione chiusa durante l'upload: confirm dà not_found e la chiave è in coda", async () => {
    const ctx = await setup();
    const ticket = await request(ctx);
    const { mediaKey } = await rowOf(ticket.lanternId);
    await put(ticket);
    await endConnection(db, { connectionId: ctx.conn.id, userId: ctx.marco.id, now });
    expect(
      await confirmMediaLantern(db, storage, { lanternId: ticket.lanternId, userId: ctx.giulia.id }),
    ).toEqual({ ok: false, error: "not_found" });
    expect(await queued()).toEqual([mediaKey]);
  });
});

describe("coda dei file da cancellare", () => {
  test("eliminare user o connessione mette in coda le chiavi a cascata", async () => {
    const ctx = await setup();
    const first = await existingAudio(ctx, 60, { mediaKey: `media/${randomUUID()}` });
    await db.delete(connections).where(eq(connections.id, ctx.conn.id));
    expect(await queued()).toEqual([first.mediaKey]);

    await resetDb(db);
    const again = await setup();
    const second = await existingAudio(again, 60, { mediaKey: `media/${randomUUID()}` });
    await db.delete(user).where(eq(user.id, again.giulia.id));
    expect(await queued()).toEqual([second.mediaKey]);
  });

  test("le lanterne senza file non entrano in coda", async () => {
    const ctx = await setup();
    const textual = await existingAudio(ctx, 60, { type: "text", text: "ciao", durationSec: null });
    await db.delete(lanterns).where(eq(lanterns.id, textual.id));
    expect(await queued()).toEqual([]);
  });
});

describe("getMediaUrl", () => {
  const REVEAL = new Date("2026-11-03T02:30:00.000Z");
  const EXPIRE = new Date("2026-11-03T11:00:00.000Z");

  test("getMediaUrl: destinatario solo da revealAt a expiresAt, oppure se conservata", async () => {
    const ctx = await setup();
    const { lanternId } = await ready(ctx);
    const asMarco = (at: Date) => getMediaUrl(db, storage, { lanternId, userId: ctx.marco.id, now: at });

    expect(await asMarco(now)).toEqual({ ok: false, error: "not_found" });
    const open = await asMarco(REVEAL);
    if (!open.ok) throw new Error(open.error);
    expect(open.value.mime).toBe("audio/mp4");
    expect((await fetch(open.value.url)).status).toBe(200);
    expect(await asMarco(EXPIRE)).toEqual({ ok: false, error: "not_found" });

    await saveLantern(db, { lanternId, userId: ctx.marco.id, now: REVEAL });
    expect((await asMarco(EXPIRE)).ok).toBe(true);
  });

  test("getMediaUrl: mittente fino a expiresAt, estraneo not_found, uploading not_found", async () => {
    const ctx = await setup();
    const { lanternId } = await ready(ctx);
    const url = (userId: string, at: Date, id = lanternId) =>
      getMediaUrl(db, storage, { lanternId: id, userId, now: at });

    expect((await url(ctx.giulia.id, now)).ok).toBe(true);
    expect(await url(ctx.giulia.id, EXPIRE)).toEqual({ ok: false, error: "not_found" });
    const sara = await makeUser(db);
    expect(await url(sara.id, REVEAL)).toEqual({ ok: false, error: "not_found" });

    const pending = await request(ctx);
    expect(await url(ctx.giulia.id, now, pending.lanternId)).toEqual({ ok: false, error: "not_found" });
    expect(await url(ctx.marco.id, REVEAL, pending.lanternId)).toEqual({ ok: false, error: "not_found" });
  });

  test("getChannel non espone mai mediaKey e nasconde le uploading", async () => {
    const ctx = await setup();
    const shown = await ready(ctx);
    const hidden = await request(ctx);
    const { mediaKey } = await rowOf(shown.lanternId);

    const channel = await getChannel(db, { connectionId: ctx.conn.id, userId: ctx.giulia.id, now });
    if (!channel.ok) throw new Error(channel.error);
    expect(channel.value.sent.map((l) => l.id)).toEqual([shown.lanternId]);
    expect(channel.value.sent[0]).toMatchObject({ type: "audio", mediaMime: "audio/mp4", durationSec: 60 });
    expect(JSON.stringify(channel.value)).not.toContain(mediaKey);
    expect(JSON.stringify(channel.value)).not.toContain(hidden.lanternId);
  });
});
