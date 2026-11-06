import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { deleteAccount } from "@/lib/access/account";
import { listConnections } from "@/lib/access/connections";
import { blocks, connections, invites, lanterns, session, storageDeletions, user } from "@/lib/db/schema";
import { getTestDb, makeConnection, makeLantern, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();
const now = new Date("2026-11-02T22:00:00Z");
const later = new Date("2026-11-03T22:00:00Z");

beforeEach(() => resetDb(db));

const lanternBetween = (connectionId: string, senderId: string, recipientId: string, over = {}) =>
  makeLantern(db, { connectionId, senderId, recipientId, revealAt: later, expiresAt: later, ...over });

async function addSession(userId: string) {
  const [row] = await db
    .insert(session)
    .values({
      id: randomUUID(),
      token: randomUUID(),
      userId,
      expiresAt: later,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

test("elimina utente, sessioni, connessioni e lanterne, e accoda i file", async () => {
  const giulia = await makeUser(db, { name: "Giulia" });
  const marco = await makeUser(db, { name: "Marco" });
  const conn = await makeConnection(db, giulia, marco);
  await addSession(giulia.id);
  await db.insert(blocks).values({ blockerId: giulia.id, blockedId: (await makeUser(db)).id });
  await db.insert(invites).values({ inviterId: giulia.id, code: randomUUID(), proposedRevealTime: "21:30", expiresAt: later });
  const sentKey = `media/${randomUUID()}`;
  const receivedKey = `media/${randomUUID()}`;
  await lanternBetween(conn.id, giulia.id, marco.id, { type: "audio", text: null, mediaKey: sentKey });
  // Anche una lanterna di Marco conservata da Giulia fa parte dei suoi dati.
  await lanternBetween(conn.id, marco.id, giulia.id, { type: "photo", text: null, mediaKey: receivedKey, savedAt: now });

  expect(await deleteAccount(db, { userId: giulia.id, confirmation: "ELIMINA" })).toEqual({ ok: true, value: undefined });

  expect(await db.select().from(user).where(eq(user.id, giulia.id))).toEqual([]);
  expect(await db.select().from(session).where(eq(session.userId, giulia.id))).toEqual([]);
  expect(await db.select().from(connections).where(eq(connections.id, conn.id))).toEqual([]);
  expect(await db.select().from(lanterns)).toEqual([]);
  expect(await db.select().from(invites)).toEqual([]);
  expect(await db.select().from(blocks).where(eq(blocks.blockerId, giulia.id))).toEqual([]);
  const queued = (await db.select().from(storageDeletions)).map((row) => row.key);
  expect(queued.sort()).toEqual([sentKey, receivedKey].sort());
});

test.each(["", "elimina", "ELIMINARE", "si"])("senza la parola ELIMINA (%j) restituisce invalid_input e non tocca nulla", async (confirmation) => {
  const giulia = await makeUser(db, { name: "Giulia" });
  const marco = await makeUser(db, { name: "Marco" });
  const conn = await makeConnection(db, giulia, marco);

  expect(await deleteAccount(db, { userId: giulia.id, confirmation })).toEqual({ ok: false, error: "invalid_input" });
  expect(await db.select().from(user).where(eq(user.id, giulia.id))).toHaveLength(1);
  expect(await db.select().from(connections).where(eq(connections.id, conn.id))).toHaveLength(1);
});

test("uno spazio in più dalla tastiera del telefono non conta", async () => {
  const giulia = await makeUser(db);
  expect(await deleteAccount(db, { userId: giulia.id, confirmation: " ELIMINA " })).toEqual({ ok: true, value: undefined });
});

test("un utente che non esiste più riceve not_found", async () => {
  expect(await deleteAccount(db, { userId: randomUUID(), confirmation: "ELIMINA" })).toEqual({
    ok: false,
    error: "not_found",
  });
});

test("non tocca gli altri utenti, che vedono la persona sparire dalle connessioni", async () => {
  const giulia = await makeUser(db, { name: "Giulia" });
  const marco = await makeUser(db, { name: "Marco" });
  const sara = await makeUser(db, { name: "Sara" });
  await makeConnection(db, giulia, marco);
  const stays = await makeConnection(db, marco, sara);
  const kept = await lanternBetween(stays.id, marco.id, sara.id, { savedAt: now });
  await addSession(marco.id);

  await deleteAccount(db, { userId: giulia.id, confirmation: "ELIMINA" });

  const seenByMarco = await listConnections(db, { userId: marco.id, now });
  expect(seenByMarco.map((c) => c.id)).toEqual([stays.id]);
  expect(await db.select().from(user).where(or(eq(user.id, marco.id), eq(user.id, sara.id)))).toHaveLength(2);
  expect(await db.select().from(session).where(eq(session.userId, marco.id))).toHaveLength(1);
  expect(await db.select().from(lanterns).where(eq(lanterns.id, kept.id))).toHaveLength(1);
});
