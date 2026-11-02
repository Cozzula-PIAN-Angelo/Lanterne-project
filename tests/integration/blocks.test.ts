import { beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { blockUser, isBlockedEitherWay, listBlocked, unblockUser } from "@/lib/access/blocks";
import { connections, lanterns } from "@/lib/db/schema";
import { getTestDb, makeConnection, makeLantern, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();
const now = new Date("2026-11-02T10:00:00Z");
const expiresAt = new Date("2026-11-03T10:00:00Z");

beforeEach(() => resetDb(db));

test("blockUser chiude la connessione e cancella le lanterne del bloccante", async () => {
  const blocker = await makeUser(db, { name: "Anna" });
  const blocked = await makeUser(db, { name: "Bruno" });
  const c = await makeConnection(db, blocker, blocked);
  // lanterna del bloccante, salvata dal bloccato: va eliminata
  await makeLantern(db, {
    connectionId: c.id,
    senderId: blocker.id,
    recipientId: blocked.id,
    revealAt: now,
    expiresAt,
    savedAt: now,
  });
  // lanterna del bloccato, salvata dal bloccante: resta
  const kept = await makeLantern(db, {
    connectionId: c.id,
    senderId: blocked.id,
    recipientId: blocker.id,
    revealAt: now,
    expiresAt,
    savedAt: now,
  });

  expect(await blockUser(db, { blockerId: blocker.id, blockedId: blocked.id, now })).toEqual({
    ok: true,
    value: undefined,
  });
  // idempotente
  expect((await blockUser(db, { blockerId: blocker.id, blockedId: blocked.id, now })).ok).toBe(true);

  const [conn] = await db.select().from(connections).where(eq(connections.id, c.id));
  expect(conn).toMatchObject({ status: "ended", endedAt: now });
  const left = await db.select().from(lanterns);
  expect(left.map((l) => l.id)).toEqual([kept.id]);
  expect(await isBlockedEitherWay(db, blocked.id, blocker.id)).toBe(true);
  expect(await listBlocked(db, blocker.id)).toEqual([{ id: blocked.id, name: "Bruno" }]);
});

test("bloccare un utente inesistente → not_found, non un errore", async () => {
  const blocker = await makeUser(db);
  expect(await blockUser(db, { blockerId: blocker.id, blockedId: "inesistente", now })).toEqual({
    ok: false,
    error: "not_found",
  });
});

test("unblockUser toglie il blocco ma la connessione resta chiusa", async () => {
  const blocker = await makeUser(db);
  const blocked = await makeUser(db);
  const c = await makeConnection(db, blocker, blocked);
  await blockUser(db, { blockerId: blocker.id, blockedId: blocked.id, now });

  expect(await unblockUser(db, { blockerId: blocker.id, blockedId: blocked.id })).toEqual({
    ok: true,
    value: undefined,
  });
  expect(await isBlockedEitherWay(db, blocker.id, blocked.id)).toBe(false);
  const [conn] = await db.select().from(connections).where(eq(connections.id, c.id));
  expect(conn.status).toBe("ended");
});
