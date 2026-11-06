import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import {
  notifyArrivals,
  removePushSubscription,
  savePushSubscription,
  type PushMessage,
  type PushSender,
  type PushSubscriptionRow,
} from "@/lib/access/push";
import { connections as connectionsTable, lanterns, pushSubscriptions, user as userTable } from "@/lib/db/schema";
import { getTestDb, makeConnection, makeLantern, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();
const before = new Date("2026-11-02T21:00:00Z");
const now = new Date("2026-11-02T22:00:00Z");
const after = new Date("2026-11-03T22:00:00Z");

beforeEach(() => resetDb(db));

function fakeSender(reply: Awaited<ReturnType<PushSender>> = "sent") {
  const calls: { sub: PushSubscriptionRow; message: PushMessage }[] = [];
  const send: PushSender = async (sub, message) => {
    calls.push({ sub, message });
    return reply;
  };
  return { calls, send };
}

const device = (name: string) => ({
  endpoint: `https://push.example.test/${name}`,
  p256dh: "BPk3dGVzdA",
  auth: "dGVzdA",
});

async function subscribe(userId: string, name: string) {
  const result = await savePushSubscription(db, { userId, ...device(name) });
  expect(result.ok).toBe(true);
}

/** Marco scrive a Pia, che ha un dispositivo registrato. */
async function pair() {
  const marco = await makeUser(db, { name: "Marco" });
  const pia = await makeUser(db, { name: "Pia" });
  const connection = await makeConnection(db, marco, pia);
  await subscribe(pia.id, "pia");
  const arrived = (over = {}) =>
    makeLantern(db, {
      connectionId: connection.id,
      senderId: marco.id,
      recipientId: pia.id,
      revealAt: before,
      expiresAt: after,
      ...over,
    });
  return { marco, pia, connection, arrived };
}

test("una notifica per destinatario e connessione, con il nome del mittente", async () => {
  const { pia, connection, arrived } = await pair();
  await arrived();
  await arrived();
  await arrived();
  const sara = await makeUser(db, { name: "Sara" });
  const other = await makeConnection(db, sara, pia);
  await makeLantern(db, {
    connectionId: other.id,
    senderId: sara.id,
    recipientId: pia.id,
    revealAt: before,
    expiresAt: after,
  });

  const { calls, send } = fakeSender();
  const result = await notifyArrivals(db, { now, send });

  expect(result).toEqual({ groups: 2, failed: 0 });
  expect(calls.map((c) => c.message)).toEqual(
    expect.arrayContaining([
      { title: "Lanterne", body: "Le lanterne di Marco sono arrivate", url: `/persone/${connection.id}` },
      { title: "Lanterne", body: "Le lanterne di Sara sono arrivate", url: `/persone/${other.id}` },
    ]),
  );
  expect(calls).toHaveLength(2);
});

test("il messaggio non contiene mai il testo della lanterna", async () => {
  const { arrived } = await pair();
  await arrived({ text: "segreto-della-sera" });

  const { calls, send } = fakeSender();
  await notifyArrivals(db, { now, send });

  expect(calls).toHaveLength(1);
  expect(JSON.stringify(calls[0].message)).not.toContain("segreto");
});

test("due esecuzioni, anche simultanee, non mandano doppioni", async () => {
  const { arrived } = await pair();
  await arrived();
  await arrived();

  const { calls, send } = fakeSender();
  await Promise.all([notifyArrivals(db, { now, send }), notifyArrivals(db, { now, send })]);
  await notifyArrivals(db, { now, send });

  expect(calls).toHaveLength(1);
});

test("ignora sigillate, uploading, scadute e già notificate", async () => {
  const { arrived } = await pair();
  const sealed = await arrived({ revealAt: after, expiresAt: new Date(after.getTime() + 1000) });
  await arrived({ status: "uploading", type: "audio", text: null });
  await arrived({ expiresAt: now });
  await arrived({ notifiedAt: before });

  const { calls, send } = fakeSender();
  expect(await notifyArrivals(db, { now, send })).toEqual({ groups: 0, failed: 0 });
  expect(calls).toHaveLength(0);

  // La sigillata non è persa: parte quando arriva la sua ora.
  expect(await notifyArrivals(db, { now: after, send })).toEqual({ groups: 1, failed: 0 });
  const [row] = await db.select().from(lanterns).where(eq(lanterns.id, sealed.id));
  expect(row.notifiedAt).toEqual(after);
});

test("una connessione chiusa non riceve notifiche, e le sue lanterne risultano gestite", async () => {
  const { connection, arrived } = await pair();
  const saved = await arrived({ savedAt: before });
  await db.update(connectionsTable).set({ status: "ended" }).where(eq(connectionsTable.id, connection.id));

  const { calls, send } = fakeSender();
  expect(await notifyArrivals(db, { now, send })).toEqual({ groups: 0, failed: 0 });

  expect(calls).toHaveLength(0);
  const [row] = await db.select().from(lanterns).where(eq(lanterns.id, saved.id));
  expect(row.notifiedAt).toEqual(now);
});

test("chi non ha sottoscrizioni viene comunque marcato", async () => {
  const marco = await makeUser(db, { name: "Marco" });
  const pia = await makeUser(db, { name: "Pia" });
  const connection = await makeConnection(db, marco, pia);
  const lantern = await makeLantern(db, {
    connectionId: connection.id,
    senderId: marco.id,
    recipientId: pia.id,
    revealAt: before,
    expiresAt: after,
  });

  const { calls, send } = fakeSender();
  await notifyArrivals(db, { now, send });

  expect(calls).toHaveLength(0);
  const [row] = await db.select().from(lanterns).where(eq(lanterns.id, lantern.id));
  expect(row.notifiedAt).toEqual(now);
});

test("gone rimuove la sottoscrizione; failed la tiene", async () => {
  const { pia, arrived } = await pair();
  await arrived();
  expect(await notifyArrivals(db, { now, send: fakeSender("failed").send })).toEqual({ groups: 1, failed: 1 });
  expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, pia.id))).toHaveLength(1);

  await arrived();
  expect(await notifyArrivals(db, { now, send: fakeSender("gone").send })).toEqual({ groups: 1, failed: 0 });
  expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, pia.id))).toHaveLength(0);
});

test("ogni dispositivo dello stesso utente riceve la notifica", async () => {
  const { pia, arrived } = await pair();
  await subscribe(pia.id, "pia-tablet");
  await arrived();

  const { calls, send } = fakeSender();
  expect(await notifyArrivals(db, { now, send })).toEqual({ groups: 1, failed: 0 });

  expect(calls.map((c) => c.sub.endpoint).sort()).toEqual([device("pia").endpoint, device("pia-tablet").endpoint]);
});

test.each([
  ["http", "http://push.example.test/a"],
  ["file", "file:///etc/passwd"],
  ["testo", "non un indirizzo"],
  ["localhost", "https://localhost:9000/a"],
  ["IPv4", "https://127.0.0.1/a"],
  ["IPv4 scritto come numero", "https://2130706433/a"],
  ["IPv6", "https://[::1]/a"],
])("rifiuta un endpoint non valido con invalid_input: %s", async (_, endpoint) => {
  const pia = await makeUser(db);
  const result = await savePushSubscription(db, { userId: pia.id, ...device("x"), endpoint });
  expect(result).toEqual({ ok: false, error: "invalid_input" });
  expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
});

test.each([
  ["p256dh vuota", { p256dh: "" }],
  ["auth vuota", { auth: "" }],
  ["p256dh non base64url", { p256dh: "non valida!" }],
  ["endpoint troppo lungo", { endpoint: `https://push.example.test/${"a".repeat(2048)}` }],
])("rifiuta chiavi non valide con invalid_input: %s", async (_, over) => {
  const pia = await makeUser(db);
  const result = await savePushSubscription(db, { userId: pia.id, ...device("x"), ...over });
  expect(result).toEqual({ ok: false, error: "invalid_input" });
});

test("lo stesso endpoint passa all'ultimo utente che lo registra", async () => {
  const marco = await makeUser(db);
  const pia = await makeUser(db);
  await subscribe(marco.id, "condiviso");
  await subscribe(pia.id, "condiviso");

  const rows = await db.select().from(pushSubscriptions);
  expect(rows).toHaveLength(1);
  expect(rows[0].userId).toBe(pia.id);
});

test("non si può rimuovere la sottoscrizione di un altro", async () => {
  const marco = await makeUser(db);
  const pia = await makeUser(db);
  await subscribe(pia.id, "pia");

  const result = await removePushSubscription(db, { userId: marco.id, endpoint: device("pia").endpoint });
  expect(result).toEqual({ ok: false, error: "not_found" });
  expect(await db.select().from(pushSubscriptions)).toHaveLength(1);

  const own = await removePushSubscription(db, { userId: pia.id, endpoint: device("pia").endpoint });
  expect(own.ok).toBe(true);
  expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
});

test("eliminare l'utente elimina le sue sottoscrizioni", async () => {
  const pia = await makeUser(db);
  await subscribe(pia.id, "pia");
  await db.delete(userTable).where(eq(userTable.id, pia.id));
  expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
});
