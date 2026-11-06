import { beforeEach, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { acceptProposal, proposeRevealTime } from "@/lib/access/connections";
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

  test("un invio fallito non porta il testo della lanterna nell'errore, che finirebbe nei log", async () => {
    const giulia = await makeUser(db, { name: "Giulia" });
    const marco = await makeUser(db, { name: "Marco" });
    const conn = await makeConnection(db, giulia, marco);
    // Postgres rifiuta il carattere NUL: è un vero errore di insert, con il testo tra i parametri.
    const failure: Error = await createTextLantern(db, {
      connectionId: conn.id,
      senderId: giulia.id,
      text: "segreto privato\u0000",
      now,
    }).then(
      () => {
        throw new Error("L'insert doveva fallire");
      },
      (error: Error) => error,
    );
    expect(failure.message).toBe("Invio della lanterna non riuscito");
    expect(failure.cause).toBeUndefined();
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

test("nextDepartureAt usa il fuso del partner ed è null se la connessione non è attiva", async () => {
  const { giulia, marco, conn } = await setup();
  // Giulia scrive a Marco, a New York: le 21:30 sono le sue.
  const res = await getChannel(db, { connectionId: conn.id, userId: giulia.id, now });
  if (!res.ok) throw new Error(res.error);
  expect(res.value.nextDepartureAt?.toISOString()).toBe(REVEAL);

  // Per Marco il partner è Giulia, a Roma: le 21:30 di domani.
  const other = await getChannel(db, { connectionId: conn.id, userId: marco.id, now });
  if (!other.ok) throw new Error(other.error);
  expect(other.value.nextDepartureAt?.toISOString()).toBe("2026-11-03T20:30:00.000Z");

  for (const status of ["pending", "ended"] as const) {
    await db.update(connections).set({ status }).where(eq(connections.id, conn.id));
    const closed = await getChannel(db, { connectionId: conn.id, userId: giulia.id, now });
    if (!closed.ok) throw new Error(closed.error);
    expect(closed.value.nextDepartureAt).toBeNull();
  }
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

describe("concorrenza e cambi d'orario", () => {
  test("una chiusura in corso blocca la creazione → connection_not_active", async () => {
    const { giulia, conn } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let markLocked!: () => void;
    const locked = new Promise<void>((r) => (markLocked = r));
    const closing = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM connections WHERE id = ${conn.id} FOR UPDATE`);
      await tx.update(connections).set({ status: "ended", endedAt: now }).where(eq(connections.id, conn.id));
      markLocked();
      await gate;
    });
    await locked;
    const creating = createTextLantern(db, { connectionId: conn.id, senderId: giulia.id, text: "ciao", now });
    await new Promise((r) => setTimeout(r, 200));
    release();
    await closing;
    expect(await creating).toEqual({ ok: false, error: "connection_not_active" });
  });

  const change = async (connectionId: string, from: string, to: string, time: string, iso: string) => {
    await proposeRevealTime(db, { connectionId, userId: from, time, now: at(iso) });
    await acceptProposal(db, { connectionId, userId: to, now: at(iso) });
  };

  test("due cambi accettati lo stesso giorno: stasera vale ancora l'orario originale", async () => {
    const { giulia, marco, conn } = await setup();
    await change(conn.id, giulia.id, marco.id, "22:00", "2026-11-02T10:00:00Z");
    await change(conn.id, giulia.id, marco.id, "23:00", "2026-11-02T12:00:00Z");
    const res = await createTextLantern(db, {
      connectionId: conn.id,
      senderId: marco.id,
      text: "ciao",
      now: at("2026-11-02T13:00:00Z"),
    });
    // 21:30 a Roma (UTC+1): l'orario in vigore stasera, prima di entrambi i cambi
    expect(res.ok && res.value.revealAt.toISOString()).toBe("2026-11-02T20:30:00.000Z");
  });

  test("cambio accettato il giorno dopo: l'orario precedente è quello del primo cambio", async () => {
    const { giulia, marco, conn } = await setup();
    await change(conn.id, giulia.id, marco.id, "22:00", "2026-11-02T10:00:00Z");
    await change(conn.id, giulia.id, marco.id, "23:00", "2026-11-03T12:00:00Z");
    const [row] = await db.select().from(connections).where(eq(connections.id, conn.id));
    expect(row).toMatchObject({ revealTime: "23:00", previousRevealTime: "22:00" });
  });

  test("partnerLeftNothing falso se la connessione è nata dopo l'apertura di stasera", async () => {
    const { marco, conn } = await setup();
    await db
      .update(connections)
      .set({ activatedAt: at("2026-11-03T02:45:00Z") })
      .where(eq(connections.id, conn.id));
    const res = await getChannel(db, { connectionId: conn.id, userId: marco.id, now: at("2026-11-03T03:00:00Z") });
    expect(res.ok && res.value.partnerLeftNothing).toBe(false);
  });
});
