import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { arriveNow, canArriveNow } from "@/lib/access/dev";
import { notifyArrivals, savePushSubscription, type PushSender } from "@/lib/access/push";
import { lanterns } from "@/lib/db/schema";
import { computeExpiresAt } from "@/lib/time/lantern-times";
import { getTestDb, makeConnection, makeLantern, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();
const now = new Date("2026-11-02T15:00:00Z");
const future = new Date("2026-11-02T20:30:00Z");
const farFuture = new Date("2026-11-03T15:00:00Z");
const past = new Date("2026-11-02T10:00:00Z");

beforeEach(() => resetDb(db));

async function setup() {
  const anna = await makeUser(db, { name: "Anna", timezone: "Europe/Rome" });
  const luca = await makeUser(db, { name: "Luca", timezone: "America/New_York" });
  const connection = await makeConnection(db, anna, luca);
  const lantern = (from: typeof anna, to: typeof anna, over = {}) =>
    makeLantern(db, {
      connectionId: connection.id,
      senderId: from.id,
      recipientId: to.id,
      revealAt: future,
      expiresAt: farFuture,
      ...over,
    });
  return { anna, luca, connection, lantern };
}

const reload = async (id: string) =>
  (await db.select().from(lanterns).where(eq(lanterns.id, id)))[0];

test("arriveNow anticipa le lanterne in attesa in entrambe le direzioni", async () => {
  const { anna, luca, connection, lantern } = await setup();
  const toLuca = await lantern(anna, luca);
  const toAnna = await lantern(luca, anna);
  const result = await arriveNow(db, { connectionId: connection.id, userId: luca.id, now });
  expect(result).toEqual({ ok: true, value: { count: 2 } });
  const a = await reload(toLuca.id);
  const b = await reload(toAnna.id);
  expect(a.revealAt).toEqual(now);
  expect(a.expiresAt).toEqual(computeExpiresAt(now, "America/New_York"));
  expect(b.revealAt).toEqual(now);
  expect(b.expiresAt).toEqual(computeExpiresAt(now, "Europe/Rome"));
  expect(a.notifiedAt).toBeNull();
});

test("non tocca le lanterne già arrivate né quelle in caricamento", async () => {
  const { anna, luca, connection, lantern } = await setup();
  const arrived = await lantern(anna, luca, { revealAt: past });
  const uploading = await lantern(anna, luca, { status: "uploading" });
  const result = await arriveNow(db, { connectionId: connection.id, userId: anna.id, now });
  expect(result).toEqual({ ok: true, value: { count: 0 } });
  expect((await reload(arrived.id)).revealAt).toEqual(past);
  expect((await reload(uploading.id)).revealAt).toEqual(future);
});

test("dopo arriveNow notifyArrivals le trova", async () => {
  const { anna, luca, connection, lantern } = await setup();
  await lantern(anna, luca);
  await lantern(luca, anna);
  for (const u of [anna, luca]) {
    const saved = await savePushSubscription(db, {
      userId: u.id,
      endpoint: `https://push.example.test/${u.id}`,
      p256dh: "BPk3dGVzdA",
      auth: "dGVzdA",
    });
    expect(saved.ok).toBe(true);
  }
  await arriveNow(db, { connectionId: connection.id, userId: anna.id, now });
  const calls: string[] = [];
  const send: PushSender = async (sub) => {
    calls.push(sub.endpoint);
    return "sent";
  };
  await notifyArrivals(db, { now: new Date(now.getTime() + 1000), send });
  expect(calls.sort()).toEqual(
    [`https://push.example.test/${anna.id}`, `https://push.example.test/${luca.id}`].sort(),
  );
});

test("un estraneo o una connessione non attiva ricevono not_found", async () => {
  const { anna, luca, connection, lantern } = await setup();
  const stranger = await makeUser(db);
  const waiting = await lantern(anna, luca);
  expect(await arriveNow(db, { connectionId: connection.id, userId: stranger.id, now })).toEqual({
    ok: false,
    error: "not_found",
  });
  const pending = await makeConnection(db, anna, stranger, { status: "pending" });
  expect(await arriveNow(db, { connectionId: pending.id, userId: anna.id, now })).toEqual({
    ok: false,
    error: "not_found",
  });
  expect((await reload(waiting.id)).revealAt).toEqual(future);
});

test("l'azione è consentita solo in sviluppo", () => {
  expect(canArriveNow("development")).toBe(true);
  expect(canArriveNow("production")).toBe(false);
  expect(canArriveNow("test")).toBe(false);
  expect(canArriveNow(undefined)).toBe(false);
});
