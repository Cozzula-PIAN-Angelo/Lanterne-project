import { beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { listConnections } from "@/lib/access/connections";
import { getChannel } from "@/lib/access/lanterns";
import { auth } from "@/lib/auth/auth";
import { user } from "@/lib/db/schema";
import { DEMO_PASSWORD, seedDemoData } from "@/lib/demo/seed";
import { getTestDb, makeUser, resetDb } from "../helpers/db";

const db = getTestDb();
const now = new Date("2026-11-05T10:00:00Z");

beforeEach(() => resetDb(db));

async function idOf(email: string) {
  const [row] = await db.select().from(user).where(eq(user.email, email));
  return row.id;
}

async function channels(email: string) {
  const userId = await idOf(email);
  const connections = await listConnections(db, { userId, now });
  const channelWith = async (name: string) => {
    const connection = connections.find((c) => c.partner.name === name)!;
    const result = await getChannel(db, { connectionId: connection.id, userId, now });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  return { connections, channelWith };
}

test("crea le persone, le connessioni e le lanterne della demo", async () => {
  await seedDemoData(db, now);

  const giulia = await channels("giulia@lanterne.local");
  expect(giulia.connections.map((c) => [c.partner.name, c.status, c.revealTime])).toEqual(
    expect.arrayContaining([
      ["Marco", "active", "21:30"],
      ["Sara", "active", "22:00"],
    ]),
  );
  const conMarco = await giulia.channelWith("Marco");
  expect(conMarco.arrived).toHaveLength(3);
  expect(conMarco.sent.filter((l) => l.sealed)).toHaveLength(1);
  expect((await giulia.channelWith("Sara")).memories).toHaveLength(1);

  const marco = await channels("marco@lanterne.local");
  expect((await marco.channelWith("Giulia")).arrived).toHaveLength(0);
  const conSara = marco.connections.find((c) => c.partner.name === "Sara")!;
  expect(conSara).toMatchObject({ status: "pending", proposedRevealTime: "21:00", proposedByMe: false });
});

test("rilanciarlo ricrea gli stessi dati, senza doppioni", async () => {
  await seedDemoData(db, now);
  const firstId = await idOf("giulia@lanterne.local");
  await seedDemoData(db, now);

  expect(await idOf("giulia@lanterne.local")).not.toBe(firstId);
  const giulia = await channels("giulia@lanterne.local");
  expect(giulia.connections).toHaveLength(2);
  expect((await giulia.channelWith("Marco")).arrived).toHaveLength(3);
});

test("non tocca gli utenti che non sono della demo", async () => {
  const other = await makeUser(db);
  await seedDemoData(db, now);
  await seedDemoData(db, now);
  const [row] = await db.select().from(user).where(eq(user.id, other.id));
  expect(row?.id).toBe(other.id);
});

test("di sera, chi ha lanterne arrivate non legge che l'altro non ne ha lasciate", async () => {
  const evening = new Date("2026-11-05T22:00:00Z"); // le 23:00 a Roma, dopo l'apertura delle 21:30
  await seedDemoData(db, evening);
  const userId = await idOf("giulia@lanterne.local");
  const [connection] = (await listConnections(db, { userId, now: evening })).filter(
    (c) => c.partner.name === "Marco",
  );
  const channel = await getChannel(db, { connectionId: connection.id, userId, now: evening });
  if (!channel.ok) throw new Error(channel.error);
  expect(channel.value.arrived).toHaveLength(3);
  expect(channel.value.partnerLeftNothing).toBe(false);
});

test("i dati demo si usano con la password concordata", async () => {
  await seedDemoData(db, now);
  const session = await auth.api.signInEmail({
    body: { email: "sara@lanterne.local", password: DEMO_PASSWORD },
  });
  expect(session.user.email).toBe("sara@lanterne.local");
});
