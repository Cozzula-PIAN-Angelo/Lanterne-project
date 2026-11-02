import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTextLantern,
  createThoughtLantern,
  deleteLantern,
  getChannel,
  reactToLantern,
  saveLantern,
} from "@/lib/access/lanterns";
import { connections, user } from "@/lib/db/schema";
import { getTestDb, makeConnection, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();
const now = new Date("2026-11-02T22:00:00Z");
const at = (iso: string) => new Date(iso);
const REVEAL = "2026-11-03T02:30:00.000Z";
const EXPIRE = "2026-11-03T11:00:00.000Z";

beforeEach(() => resetDb(db));

async function setup(overrides: { status?: "pending" | "ended" } = {}) {
  const giulia = await makeUser(db, { name: "Giulia", timezone: "Europe/Rome" });
  const marco = await makeUser(db, { name: "Marco", timezone: "America/New_York" });
  const conn = await makeConnection(db, giulia, marco, overrides);
  return { giulia, marco, conn };
}

async function sendText(connectionId: string, senderId: string, text = "ciao Marco") {
  const res = await createTextLantern(db, { connectionId, senderId, text, now });
  if (!res.ok) throw new Error(`createTextLantern: ${res.error}`);
  return res.value;
}

describe("creazione", () => {
  test("revealAt e expiresAt nel fuso del destinatario, sigillata", async () => {
    const { giulia, conn } = await setup();
    const l = await sendText(conn.id, giulia.id);
    expect(l.revealAt.toISOString()).toBe(REVEAL);
    expect(l.expiresAt.toISOString()).toBe(EXPIRE);
    expect(l).toMatchObject({ type: "text", text: "ciao Marco", sealed: true, savable: true });
  });

  test("connessione pending o ended → connection_not_active", async () => {
    for (const status of ["pending", "ended"] as const) {
      await resetDb(db);
      const { giulia, conn } = await setup({ status });
      expect(
        await createTextLantern(db, { connectionId: conn.id, senderId: giulia.id, text: "ciao", now }),
      ).toEqual({ ok: false, error: "connection_not_active" });
    }
  });

  test("non membro → not_found", async () => {
    const { conn } = await setup();
    const other = await makeUser(db);
    expect(
      await createTextLantern(db, { connectionId: conn.id, senderId: other.id, text: "ciao", now }),
    ).toEqual({ ok: false, error: "not_found" });
  });

  test.each([
    ["vuoto", ""],
    ["solo spazi", "   "],
    ["1001 caratteri", "a".repeat(1001)],
  ])("testo %s → invalid_input", async (_label, text) => {
    const { giulia, conn } = await setup();
    expect(await createTextLantern(db, { connectionId: conn.id, senderId: giulia.id, text, now })).toEqual({
      ok: false,
      error: "invalid_input",
    });
  });

  test("testo di 1000 caratteri → ok", async () => {
    const { giulia, conn } = await setup();
    const res = await createTextLantern(db, {
      connectionId: conn.id,
      senderId: giulia.id,
      text: "a".repeat(1000),
      now,
    });
    expect(res.ok).toBe(true);
  });

  test("pensiero: id valido salvato come testo, id inventato → invalid_input", async () => {
    const { giulia, conn } = await setup();
    const okRes = await createThoughtLantern(db, {
      connectionId: conn.id,
      senderId: giulia.id,
      thoughtId: "ti-penso",
      now,
    });
    expect(okRes).toMatchObject({ ok: true, value: { type: "thought", text: "ti-penso" } });
    expect(
      await createThoughtLantern(db, { connectionId: conn.id, senderId: giulia.id, thoughtId: "inventato", now }),
    ).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("visibilità", () => {
  test("arriva a revealAt e sparisce a expiresAt", async () => {
    const { giulia, marco, conn } = await setup();
    await sendText(conn.id, giulia.id);
    const arrived = async (iso: string) => {
      const res = await getChannel(db, { connectionId: conn.id, userId: marco.id, now: at(iso) });
      if (!res.ok) throw new Error(res.error);
      return res.value.arrived;
    };
    expect(await arrived("2026-11-03T02:29:00Z")).toHaveLength(0);
    expect(await arrived("2026-11-03T02:30:00Z")).toHaveLength(1);
    expect(await arrived("2026-11-03T11:00:00Z")).toHaveLength(0);
  });

  test("il mittente la vede in sent, aperta dopo revealAt", async () => {
    const { giulia, conn } = await setup();
    const l = await sendText(conn.id, giulia.id);
    const res = await getChannel(db, { connectionId: conn.id, userId: giulia.id, now: at("2026-11-03T03:00:00Z") });
    expect(res.ok && res.value.sent).toEqual([{ ...l, sealed: false }]);
  });

  test("terzo utente → not_found ovunque", async () => {
    const { giulia, conn } = await setup();
    const l = await sendText(conn.id, giulia.id);
    const stranger = await makeUser(db);
    const later = at("2026-11-03T03:00:00Z");
    const notFound = { ok: false, error: "not_found" };
    expect(await getChannel(db, { connectionId: conn.id, userId: stranger.id, now: later })).toEqual(notFound);
    expect(await reactToLantern(db, { lanternId: l.id, userId: stranger.id, reaction: "💛", now: later })).toEqual(
      notFound,
    );
    expect(await saveLantern(db, { lanternId: l.id, userId: stranger.id, now: later })).toEqual(notFound);
    expect(await deleteLantern(db, { lanternId: l.id, userId: stranger.id, now })).toEqual(notFound);
  });

  test("connessione chiusa: solo i ricordi", async () => {
    const { giulia, marco, conn } = await setup();
    const l = await sendText(conn.id, giulia.id);
    const later = at("2026-11-03T03:00:00Z");
    await saveLantern(db, { lanternId: l.id, userId: marco.id, now: later });
    await sendText(conn.id, giulia.id, "un'altra");
    await db.update(connections).set({ status: "ended", endedAt: later }).where(eq(connections.id, conn.id));
    const res = await getChannel(db, { connectionId: conn.id, userId: marco.id, now: later });
    expect(res.ok && res.value.arrived).toEqual([]);
    expect(res.ok && res.value.sent).toEqual([]);
    expect(res.ok && res.value.memories.map((m) => m.id)).toEqual([l.id]);
  });
});

describe("cancellazione", () => {
  test("il mittente può cancellare prima di revealAt, dopo no", async () => {
    const { giulia, conn } = await setup();
    const l1 = await sendText(conn.id, giulia.id);
    expect(await deleteLantern(db, { lanternId: l1.id, userId: giulia.id, now })).toEqual({
      ok: true,
      value: undefined,
    });
    const l2 = await sendText(conn.id, giulia.id);
    expect(await deleteLantern(db, { lanternId: l2.id, userId: giulia.id, now: at(REVEAL) })).toEqual({
      ok: false,
      error: "too_late",
    });
  });

  test("il destinatario non può cancellare → not_found", async () => {
    const { giulia, marco, conn } = await setup();
    const l = await sendText(conn.id, giulia.id);
    expect(await deleteLantern(db, { lanternId: l.id, userId: marco.id, now })).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("reazioni", () => {
  test("solo il destinatario, solo dopo l'arrivo, solo reazioni ammesse", async () => {
    const { giulia, marco, conn } = await setup();
    const l = await sendText(conn.id, giulia.id);
    const later = at("2026-11-03T03:00:00Z");
    expect(await reactToLantern(db, { lanternId: l.id, userId: marco.id, reaction: "💛", now })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await reactToLantern(db, { lanternId: l.id, userId: marco.id, reaction: "💛", now: later })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await reactToLantern(db, { lanternId: l.id, userId: marco.id, reaction: "👍", now: later })).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(await reactToLantern(db, { lanternId: l.id, userId: giulia.id, reaction: "💛", now: later })).toEqual({
      ok: false,
      error: "not_found",
    });
    const res = await getChannel(db, { connectionId: conn.id, userId: marco.id, now: later });
    expect(res.ok && res.value.arrived[0].reaction).toBe("💛");
    await reactToLantern(db, { lanternId: l.id, userId: marco.id, reaction: null, now: later });
    const res2 = await getChannel(db, { connectionId: conn.id, userId: marco.id, now: later });
    expect(res2.ok && res2.value.arrived[0].reaction).toBeNull();
  });
});

describe("salvataggio", () => {
  test("savable false → not_savable", async () => {
    const { giulia, marco, conn } = await setup();
    await db.update(user).set({ allowSaving: false }).where(eq(user.id, giulia.id));
    const l = await sendText(conn.id, giulia.id);
    expect(l.savable).toBe(false);
    expect(await saveLantern(db, { lanternId: l.id, userId: marco.id, now: at("2026-11-03T03:00:00Z") })).toEqual({
      ok: false,
      error: "not_savable",
    });
  });

  test("salvata: compare nei ricordi e resta visibile dopo la scadenza", async () => {
    const { giulia, marco, conn } = await setup();
    const l = await sendText(conn.id, giulia.id);
    // allowSaving cambiato dopo l'invio: la lanterna resta salvabile
    await db.update(user).set({ allowSaving: false }).where(eq(user.id, giulia.id));
    expect(await saveLantern(db, { lanternId: l.id, userId: marco.id, now: at("2026-11-03T03:00:00Z") })).toEqual({
      ok: true,
      value: undefined,
    });
    const afterExpiry = at("2026-11-04T12:00:00Z");
    const res = await getChannel(db, { connectionId: conn.id, userId: marco.id, now: afterExpiry });
    expect(res.ok && res.value.memories.map((m) => m.id)).toEqual([l.id]);
    expect(await reactToLantern(db, { lanternId: l.id, userId: marco.id, reaction: "🌙", now: afterExpiry })).toEqual({
      ok: true,
      value: undefined,
    });
  });
});

describe("partnerLeftNothing", () => {
  const leftNothing = async (connectionId: string, userId: string, iso: string) => {
    const res = await getChannel(db, { connectionId, userId, now: at(iso) });
    if (!res.ok) throw new Error(res.error);
    return res.value.partnerLeftNothing;
  };

  test("sera senza lanterne → true", async () => {
    const { marco, conn } = await setup();
    expect(await leftNothing(conn.id, marco.id, "2026-11-03T03:00:00Z")).toBe(true);
  });

  test("con una lanterna arrivata → false", async () => {
    const { giulia, marco, conn } = await setup();
    await sendText(conn.id, giulia.id);
    expect(await leftNothing(conn.id, marco.id, "2026-11-03T03:00:00Z")).toBe(false);
  });

  test("pomeriggio a New York, finestra della sera prima scaduta → false", async () => {
    const { marco, conn } = await setup();
    expect(await leftNothing(conn.id, marco.id, "2026-11-02T15:00:00Z")).toBe(false);
  });
});
