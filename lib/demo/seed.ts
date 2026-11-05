import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import type { Db } from "@/lib/db/client";
import { connections, lanterns, user } from "@/lib/db/schema";
import { COLORS } from "@/lib/lanterns/constants";
import { computeExpiresAt, computeRevealAt } from "@/lib/time/lantern-times";

export const DEMO_PASSWORD = "lanterne-demo";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const colorHex = (id: (typeof COLORS)[number]["id"]) => COLORS.find((c) => c.id === id)!.hex;

const PEOPLE = {
  giulia: { name: "Giulia", email: "giulia@lanterne.local", timezone: "Europe/Rome", color: colorHex("ambra") },
  marco: { name: "Marco", email: "marco@lanterne.local", timezone: "America/New_York", color: colorHex("lilla") },
  sara: { name: "Sara", email: "sara@lanterne.local", timezone: "Europe/Rome", color: colorHex("salvia") },
};

async function createPerson(db: Db, person: (typeof PEOPLE)[keyof typeof PEOPLE]) {
  const { user: created } = await auth.api.signUpEmail({
    body: { name: person.name, email: person.email, password: DEMO_PASSWORD },
  });
  await db
    .update(user)
    .set({ color: person.color, timezone: person.timezone, emailVerified: true })
    .where(eq(user.id, created.id));
  return created.id;
}

/**
 * Cancella e ricrea i dati demo, con istanti relativi a `now`.
 * Cancella solo gli utenti demo (per email): le loro connessioni e lanterne seguono a cascata.
 */
export async function seedDemoData(db: Db, now: Date): Promise<void> {
  const emails = Object.values(PEOPLE).map((p) => p.email);
  await db.delete(user).where(inArray(user.email, emails));

  const giulia = await createPerson(db, PEOPLE.giulia);
  const marco = await createPerson(db, PEOPLE.marco);
  const sara = await createPerson(db, PEOPLE.sara);

  const lastWeek = new Date(now.getTime() - 7 * DAY_MS);
  const pair = (a: string, b: string) => {
    const [userAId, userBId] = [a, b].sort();
    return { userAId, userBId, createdAt: lastWeek };
  };

  const [giuliaMarco] = await db
    .insert(connections)
    .values({ ...pair(giulia, marco), status: "active", revealTime: "21:30", activatedAt: lastWeek })
    .returning();
  const [giuliaSara] = await db
    .insert(connections)
    .values({ ...pair(giulia, sara), status: "active", revealTime: "22:00", activatedAt: lastWeek })
    .returning();
  await db.insert(connections).values({
    ...pair(marco, sara),
    status: "pending",
    proposedRevealTime: "21:00",
    proposedBy: sara,
    proposedAt: lastWeek,
  });

  // Marco → Giulia: arrivate da un'ora, ancora leggibili.
  const fromMarco = {
    connectionId: giuliaMarco.id,
    senderId: marco,
    recipientId: giulia,
    status: "ready" as const,
    revealAt: new Date(now.getTime() - HOUR_MS),
    expiresAt: new Date(now.getTime() + 7 * HOUR_MS),
    savable: true,
    createdAt: new Date(now.getTime() - 6 * HOUR_MS),
  };
  await db.insert(lanterns).values([
    { ...fromMarco, type: "text", text: "Oggi a Brooklyn nevica: ti avrebbe fatto ridere il mio cappello." },
    { ...fromMarco, type: "text", text: "Ho trovato il libro di cui parlavamo. Te lo tengo da parte." },
    { ...fromMarco, type: "thought", text: "ti-penso" },
  ]);

  // Giulia → Marco: ancora sigillata, parte alla prossima apertura di Marco.
  const revealAt = computeRevealAt(
    { revealTime: "21:30", previousRevealTime: null, revealTimeChangedAt: null },
    PEOPLE.marco.timezone,
    now,
  );
  await db.insert(lanterns).values({
    connectionId: giuliaMarco.id,
    senderId: giulia,
    recipientId: marco,
    type: "text",
    text: "Stasera il tramonto sul Tevere era tutto arancione. Te lo racconto meglio domani.",
    status: "ready",
    revealAt,
    expiresAt: computeExpiresAt(revealAt, PEOPLE.marco.timezone),
    savable: true,
    createdAt: now,
  });

  // Sara → Giulia: scaduta, ma conservata tra i ricordi.
  await db.insert(lanterns).values({
    connectionId: giuliaSara.id,
    senderId: sara,
    recipientId: giulia,
    type: "text",
    text: "Grazie per ieri. Avevo proprio bisogno di quella passeggiata.",
    status: "ready",
    revealAt: new Date(now.getTime() - 3 * DAY_MS),
    expiresAt: new Date(now.getTime() - 2 * DAY_MS),
    savable: true,
    savedAt: new Date(now.getTime() - 3 * DAY_MS + HOUR_MS),
    createdAt: new Date(now.getTime() - 3 * DAY_MS - 6 * HOUR_MS),
  });
}
