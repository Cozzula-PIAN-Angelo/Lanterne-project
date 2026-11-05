import { beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  acceptProposal,
  endConnection,
  getConnectionForMember,
  listClosedWithMemories,
  listConnections,
  proposeRevealTime,
  rejectProposal,
} from "@/lib/access/connections";
import { connections, lanterns } from "@/lib/db/schema";
import { getTestDb, makeConnection, makeLantern, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();
const now = new Date("2026-11-02T10:00:00Z");

beforeEach(() => resetDb(db));

async function pair() {
  const a = await makeUser(db, { name: "Anna" });
  const b = await makeUser(db, { name: "Bruno", timezone: "America/New_York" });
  return { a, b };
}

async function connectionRow(id: string) {
  const [row] = await db.select().from(connections).where(eq(connections.id, id));
  return row;
}

test("proposta accettata dall'altro su una connessione active", async () => {
  const { a, b } = await pair();
  const c = await makeConnection(db, a, b);
  expect(await proposeRevealTime(db, { connectionId: c.id, userId: a.id, time: "22:15", now })).toEqual({
    ok: true,
    value: undefined,
  });
  expect(await acceptProposal(db, { connectionId: c.id, userId: b.id, now })).toEqual({
    ok: true,
    value: undefined,
  });
  expect(await connectionRow(c.id)).toMatchObject({
    status: "active",
    revealTime: "22:15",
    previousRevealTime: "21:30",
    revealTimeChangedAt: now,
    proposedRevealTime: null,
    proposedBy: null,
    proposedAt: null,
  });
});

test("proposta accettata su una connessione pending → active senza orario precedente", async () => {
  const { a, b } = await pair();
  const c = await makeConnection(db, a, b, {
    status: "pending",
    revealTime: null,
    proposedRevealTime: "22:00",
    proposedBy: b.id,
    proposedAt: now,
  });
  expect((await acceptProposal(db, { connectionId: c.id, userId: a.id, now })).ok).toBe(true);
  expect(await connectionRow(c.id)).toMatchObject({
    status: "active",
    revealTime: "22:00",
    previousRevealTime: null,
    proposedRevealTime: null,
    activatedAt: now,
  });
});

test("accettare la propria proposta → forbidden", async () => {
  const { a, b } = await pair();
  const c = await makeConnection(db, a, b);
  await proposeRevealTime(db, { connectionId: c.id, userId: a.id, time: "22:15", now });
  expect(await acceptProposal(db, { connectionId: c.id, userId: a.id, now })).toEqual({
    ok: false,
    error: "forbidden",
  });
});

test("una nuova proposta sostituisce la precedente", async () => {
  const { a, b } = await pair();
  const c = await makeConnection(db, a, b);
  await proposeRevealTime(db, { connectionId: c.id, userId: a.id, time: "22:15", now });
  await proposeRevealTime(db, { connectionId: c.id, userId: b.id, time: "23:00", now });
  expect(await connectionRow(c.id)).toMatchObject({ proposedRevealTime: "23:00", proposedBy: b.id });
});

test("proposta fuori fascia → invalid_reveal_time", async () => {
  const { a, b } = await pair();
  const c = await makeConnection(db, a, b);
  expect(await proposeRevealTime(db, { connectionId: c.id, userId: a.id, time: "16:30", now })).toEqual({
    ok: false,
    error: "invalid_reveal_time",
  });
});

test("rejectProposal su una connessione active azzera la proposta", async () => {
  const { a, b } = await pair();
  const c = await makeConnection(db, a, b);
  await proposeRevealTime(db, { connectionId: c.id, userId: a.id, time: "22:15", now });
  expect((await rejectProposal(db, { connectionId: c.id, userId: b.id, now })).ok).toBe(true);
  expect(await connectionRow(c.id)).toMatchObject({
    status: "active",
    revealTime: "21:30",
    proposedRevealTime: null,
  });
});

test("rejectProposal su una connessione pending → ended", async () => {
  const { a, b } = await pair();
  const c = await makeConnection(db, a, b, {
    status: "pending",
    revealTime: null,
    proposedRevealTime: "22:00",
    proposedBy: b.id,
    proposedAt: now,
  });
  expect((await rejectProposal(db, { connectionId: c.id, userId: a.id, now })).ok).toBe(true);
  expect(await connectionRow(c.id)).toMatchObject({ status: "ended", endedAt: now });
});

test("getConnectionForMember da un non membro → not_found", async () => {
  const { a, b } = await pair();
  const stranger = await makeUser(db);
  const c = await makeConnection(db, a, b);
  expect(await getConnectionForMember(db, { connectionId: c.id, userId: stranger.id, now })).toEqual({
    ok: false,
    error: "not_found",
  });
});

test("getConnectionForMember: partner e prossimo arrivo nel mio fuso", async () => {
  const { a, b } = await pair();
  const c = await makeConnection(db, a, b);
  const res = await getConnectionForMember(db, { connectionId: c.id, userId: a.id, now });
  expect(res).toEqual({
    ok: true,
    value: {
      id: c.id,
      status: "active",
      revealTime: "21:30",
      proposedRevealTime: null,
      proposedByMe: false,
      // 21:30 a Roma il 2 novembre 2026 (UTC+1)
      nextArrivalAt: new Date("2026-11-02T20:30:00Z"),
      partner: { id: b.id, name: "Bruno", color: "#E8A75C", timezone: "America/New_York" },
    },
  });
});

test("listConnections: solo active e pending", async () => {
  const { a, b } = await pair();
  const c2 = await makeUser(db);
  const c3 = await makeUser(db);
  await makeConnection(db, a, b);
  await makeConnection(db, a, c2, { status: "pending", revealTime: null, proposedRevealTime: "22:00" });
  await makeConnection(db, a, c3, { status: "ended" });
  const list = await listConnections(db, { userId: a.id, now });
  expect(list.map((c) => c.status).sort()).toEqual(["active", "pending"]);
  expect(list.find((c) => c.status === "pending")?.nextArrivalAt).toBeNull();
});

test("endConnection: le lanterne non salvate spariscono, le salvate restano", async () => {
  const { a, b } = await pair();
  const c = await makeConnection(db, a, b);
  const base = {
    connectionId: c.id,
    senderId: a.id,
    recipientId: b.id,
    revealAt: now,
    expiresAt: new Date("2026-11-03T10:00:00Z"),
  };
  await makeLantern(db, base);
  const saved = await makeLantern(db, { ...base, savedAt: now });
  expect(await endConnection(db, { connectionId: c.id, userId: b.id, now })).toEqual({
    ok: true,
    value: undefined,
  });
  expect(await connectionRow(c.id)).toMatchObject({ status: "ended", endedAt: now });
  const left = await db.select().from(lanterns).where(eq(lanterns.connectionId, c.id));
  expect(left.map((l) => l.id)).toEqual([saved.id]);
});

test("le connessioni chiuse si ritrovano solo se ti hanno lasciato dei ricordi", async () => {
  const { a, b } = await pair();
  const withMemory = await makeConnection(db, a, b, { status: "ended", endedAt: now });
  await makeLantern(db, {
    connectionId: withMemory.id,
    senderId: b.id,
    recipientId: a.id,
    revealAt: now,
    expiresAt: now,
    savedAt: now,
  });
  const c = await makeUser(db, { name: "Carla" });
  await makeConnection(db, a, c, { status: "ended", endedAt: now });

  const closed = await listClosedWithMemories(db, { userId: a.id, now });
  expect(closed.map((x) => x.partner.name)).toEqual(["Bruno"]);
  // Il ricordo è di chi l'ha ricevuto: per chi l'ha mandato non c'è niente da ritrovare.
  expect(await listClosedWithMemories(db, { userId: b.id, now })).toEqual([]);
});

test("una connessione aperta non è tra quelle chiuse, anche con dei ricordi", async () => {
  const { a, b } = await pair();
  const open = await makeConnection(db, a, b, { status: "active", revealTime: "21:30" });
  await makeLantern(db, {
    connectionId: open.id,
    senderId: b.id,
    recipientId: a.id,
    revealAt: now,
    expiresAt: now,
    savedAt: now,
  });
  expect(await listClosedWithMemories(db, { userId: a.id, now })).toEqual([]);
});
