import { and, asc, eq, gt, isNotNull, lte } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { connections, lanterns, user } from "@/lib/db/schema";
import { REACTIONS, TEXT_MAX, THOUGHTS } from "@/lib/lanterns/constants";
import { computeExpiresAt, computeRevealAt } from "@/lib/time/lantern-times";
import { previousOccurrence } from "@/lib/time/reveal-time";
import { getConnectionForMember, type ConnectionSummary } from "./connections";
import { fail, ok, type AccessResult } from "./errors";

type LanternRow = typeof lanterns.$inferSelect;

export type LanternView = {
  id: string;
  type: "audio" | "photo" | "text" | "thought";
  /** Per `thought` contiene l'id del preset. */
  text: string | null;
  senderId: string;
  revealAt: Date;
  expiresAt: Date;
  sealed: boolean;
  savable: boolean;
  savedAt: Date | null;
  reaction: string | null;
  createdAt: Date;
};

function toView(l: LanternRow, now: Date): LanternView {
  return {
    id: l.id,
    type: l.type,
    text: l.text,
    senderId: l.senderId,
    revealAt: l.revealAt,
    expiresAt: l.expiresAt,
    sealed: l.revealAt.getTime() > now.getTime(),
    savable: l.savable,
    savedAt: l.savedAt,
    reaction: l.reaction,
    createdAt: l.createdAt,
  };
}

async function createLantern(
  db: Db,
  input: { connectionId: string; senderId: string; type: "text" | "thought"; text: string; now: Date },
): Promise<AccessResult<LanternView>> {
  const { connectionId, senderId, type, text, now } = input;
  // FOR SHARE: una chiusura o un blocco in corso (FOR UPDATE) fa aspettare la creazione.
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId))
      .for("share");
    if (!c || (c.userAId !== senderId && c.userBId !== senderId)) return fail("not_found");
    if (c.status !== "active" || !c.revealTime) return fail("connection_not_active");

    const recipientId = c.userAId === senderId ? c.userBId : c.userAId;
    const [sender] = await tx.select().from(user).where(eq(user.id, senderId));
    const [recipient] = await tx.select().from(user).where(eq(user.id, recipientId));
    const recipientTz = recipient.timezone ?? "UTC";

    const revealAt = computeRevealAt(
      {
        revealTime: c.revealTime,
        previousRevealTime: c.previousRevealTime,
        revealTimeChangedAt: c.revealTimeChangedAt,
      },
      recipientTz,
      now,
    );
    const [row] = await tx
      .insert(lanterns)
      .values({
        connectionId,
        senderId,
        recipientId,
        type,
        text,
        status: "ready",
        revealAt,
        expiresAt: computeExpiresAt(revealAt, recipientTz),
        savable: sender.allowSaving ?? true,
        createdAt: now,
      })
      .returning();
    return ok(toView(row, now));
  });
}

export async function createTextLantern(
  db: Db,
  input: { connectionId: string; senderId: string; text: string; now: Date },
): Promise<AccessResult<LanternView>> {
  const text = input.text.trim();
  if (text.length < 1 || text.length > TEXT_MAX) return fail("invalid_input");
  return createLantern(db, { ...input, type: "text", text });
}

export async function createThoughtLantern(
  db: Db,
  input: { connectionId: string; senderId: string; thoughtId: string; now: Date },
): Promise<AccessResult<LanternView>> {
  if (!THOUGHTS.some((t) => t.id === input.thoughtId)) return fail("invalid_input");
  return createLantern(db, { ...input, type: "thought", text: input.thoughtId });
}

export async function getChannel(
  db: Db,
  input: { connectionId: string; userId: string; now: Date },
): Promise<
  AccessResult<{
    connection: ConnectionSummary;
    sent: LanternView[];
    arrived: LanternView[];
    memories: LanternView[];
    partnerLeftNothing: boolean;
  }>
> {
  const { connectionId, userId, now } = input;
  const found = await getConnectionForMember(db, { connectionId, userId, now });
  if (!found.ok) return found;
  const connection = found.value;

  const ready = and(eq(lanterns.connectionId, connectionId), eq(lanterns.status, "ready"));
  const memories = await db
    .select()
    .from(lanterns)
    .where(and(ready, eq(lanterns.recipientId, userId), isNotNull(lanterns.savedAt)))
    .orderBy(asc(lanterns.revealAt));

  if (connection.status === "ended") {
    return ok({
      connection,
      sent: [],
      arrived: [],
      memories: memories.map((l) => toView(l, now)),
      partnerLeftNothing: false,
    });
  }

  const sent = await db
    .select()
    .from(lanterns)
    .where(and(ready, eq(lanterns.senderId, userId), gt(lanterns.expiresAt, now)))
    .orderBy(asc(lanterns.createdAt));
  const arrived = await db
    .select()
    .from(lanterns)
    .where(
      and(
        ready,
        eq(lanterns.recipientId, userId),
        lte(lanterns.revealAt, now),
        gt(lanterns.expiresAt, now),
      ),
    )
    .orderBy(asc(lanterns.revealAt));

  let partnerLeftNothing = false;
  if (connection.status === "active" && connection.revealTime) {
    const [me] = await db.select({ timezone: user.timezone }).from(user).where(eq(user.id, userId));
    const myTz = me?.timezone ?? "UTC";
    const last = previousOccurrence(connection.revealTime, myTz, now);
    const [{ activatedAt }] = await db
      .select({ activatedAt: connections.activatedAt })
      .from(connections)
      .where(eq(connections.id, connectionId));
    // Se la connessione è nata dopo l'apertura di stasera, il partner non ha avuto occasione.
    const hadChance = !activatedAt || activatedAt.getTime() <= last.getTime();
    // Basta una lanterna leggibile, anche partita a un altro orario (cambio di fuso o d'orario).
    partnerLeftNothing =
      hadChance && now.getTime() < computeExpiresAt(last, myTz).getTime() && arrived.length === 0;
  }

  return ok({
    connection,
    sent: sent.map((l) => toView(l, now)),
    arrived: arrived.map((l) => toView(l, now)),
    memories: memories.map((l) => toView(l, now)),
    partnerLeftNothing,
  });
}

export async function deleteLantern(
  db: Db,
  input: { lanternId: string; userId: string; now: Date },
): Promise<AccessResult<void>> {
  const [l] = await db
    .select()
    .from(lanterns)
    .where(and(eq(lanterns.id, input.lanternId), eq(lanterns.senderId, input.userId)));
  if (!l) return fail("not_found");
  if (input.now.getTime() >= l.revealAt.getTime()) return fail("too_late");
  await db.delete(lanterns).where(eq(lanterns.id, l.id));
  return ok(undefined);
}

/** Lanterna del destinatario visibile ora: arrivata e non scaduta, oppure salvata. */
async function findVisibleForRecipient(db: Db, lanternId: string, userId: string, now: Date) {
  const [l] = await db
    .select()
    .from(lanterns)
    .where(
      and(
        eq(lanterns.id, lanternId),
        eq(lanterns.recipientId, userId),
        eq(lanterns.status, "ready"),
      ),
    );
  if (!l) return undefined;
  const t = now.getTime();
  const open = l.revealAt.getTime() <= t && t < l.expiresAt.getTime();
  return open || l.savedAt ? l : undefined;
}

export async function reactToLantern(
  db: Db,
  input: { lanternId: string; userId: string; reaction: string | null; now: Date },
): Promise<AccessResult<void>> {
  const { lanternId, userId, reaction, now } = input;
  const l = await findVisibleForRecipient(db, lanternId, userId, now);
  if (!l) return fail("not_found");
  if (reaction !== null && !(REACTIONS as readonly string[]).includes(reaction)) {
    return fail("invalid_input");
  }
  await db
    .update(lanterns)
    .set({ reaction, reactedAt: reaction === null ? null : now })
    .where(eq(lanterns.id, l.id));
  return ok(undefined);
}

export async function saveLantern(
  db: Db,
  input: { lanternId: string; userId: string; now: Date },
): Promise<AccessResult<void>> {
  const l = await findVisibleForRecipient(db, input.lanternId, input.userId, input.now);
  if (!l) return fail("not_found");
  if (!l.savable) return fail("not_savable");
  if (!l.savedAt) {
    await db.update(lanterns).set({ savedAt: input.now }).where(eq(lanterns.id, l.id));
  }
  return ok(undefined);
}
