import { and, asc, count, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db, DbOrTx, Tx } from "@/lib/db/client";
import { connections, lanterns, user } from "@/lib/db/schema";
import { computeRevealAt } from "@/lib/time/lantern-times";
import { isAllowedRevealTime } from "@/lib/time/reveal-time";
import { fail, ok, type AccessResult } from "./errors";

type ConnectionRow = typeof connections.$inferSelect;

export type ConnectionSummary = {
  id: string;
  status: "pending" | "active" | "ended";
  revealTime: string | null;
  proposedRevealTime: string | null;
  proposedByMe: boolean;
  nextArrivalAt: Date | null;
  partner: { id: string; name: string; color: string; timezone: string };
};

const isMember = (userId: string) =>
  or(eq(connections.userAId, userId), eq(connections.userBId, userId));

const partnerIdOf = (c: ConnectionRow, userId: string) =>
  c.userAId === userId ? c.userBId : c.userAId;

/**
 * Blocca (FOR UPDATE) le righe degli utenti, sempre in ordine di id per evitare deadlock.
 * Chi crea connessioni o blocchi tra queste persone aspetta: i conteggi restano coerenti.
 * Restituisce gli id effettivamente trovati.
 */
export async function lockUsers(tx: Tx, ids: string[]): Promise<string[]> {
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.id, ids))
    .orderBy(asc(user.id))
    .for("update");
  return rows.map((r) => r.id);
}

/** Connessioni che occupano un posto: active + pending. */
export async function countOpenConnections(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(connections)
    .where(and(isMember(userId), inArray(connections.status, ["active", "pending"])));
  return row.n;
}

async function summarize(
  db: DbOrTx,
  rows: ConnectionRow[],
  userId: string,
  now: Date,
): Promise<ConnectionSummary[]> {
  if (rows.length === 0) return [];
  const ids = [userId, ...rows.map((c) => partnerIdOf(c, userId))];
  const people = await db.select().from(user).where(inArray(user.id, ids));
  const byId = new Map(people.map((p) => [p.id, p]));
  const myTz = byId.get(userId)?.timezone ?? "UTC";

  return rows.map((c) => {
    const partner = byId.get(partnerIdOf(c, userId))!;
    const nextArrivalAt =
      c.status === "active" && c.revealTime
        ? computeRevealAt(
            {
              revealTime: c.revealTime,
              previousRevealTime: c.previousRevealTime,
              revealTimeChangedAt: c.revealTimeChangedAt,
            },
            myTz,
            now,
          )
        : null;
    return {
      id: c.id,
      status: c.status,
      revealTime: c.revealTime,
      proposedRevealTime: c.proposedRevealTime,
      proposedByMe: c.proposedBy === userId,
      nextArrivalAt,
      partner: {
        id: partner.id,
        name: partner.name,
        color: partner.color ?? "",
        timezone: partner.timezone ?? "UTC",
      },
    };
  });
}

export async function listConnections(
  db: Db,
  input: { userId: string; now: Date },
): Promise<ConnectionSummary[]> {
  const rows = await db
    .select()
    .from(connections)
    .where(and(isMember(input.userId), inArray(connections.status, ["active", "pending"])))
    .orderBy(connections.createdAt);
  return summarize(db, rows, input.userId, input.now);
}

export async function getConnectionForMember(
  db: Db,
  input: { connectionId: string; userId: string; now: Date },
): Promise<AccessResult<ConnectionSummary>> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, input.connectionId), isMember(input.userId)));
  if (!row) return fail("not_found");
  const [summary] = await summarize(db, [row], input.userId, input.now);
  return ok(summary);
}

/** Legge la connessione bloccandola, solo se l'utente ne fa parte. */
async function lockForMember(db: DbOrTx, connectionId: string, userId: string) {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), isMember(userId)))
    .for("update");
  return row as ConnectionRow | undefined;
}

const NO_PROPOSAL = { proposedRevealTime: null, proposedBy: null, proposedAt: null };

/** Chiude la connessione ed elimina le sue lanterne non salvate. */
export async function closeConnection(db: DbOrTx, connectionId: string, now: Date) {
  await db
    .update(connections)
    .set({ status: "ended", endedAt: now, ...NO_PROPOSAL })
    .where(eq(connections.id, connectionId));
  await db
    .delete(lanterns)
    .where(and(eq(lanterns.connectionId, connectionId), isNull(lanterns.savedAt)));
}

export async function proposeRevealTime(
  db: Db,
  input: { connectionId: string; userId: string; time: string; now: Date },
): Promise<AccessResult<void>> {
  const { connectionId, userId, time, now } = input;
  return db.transaction(async (tx) => {
    const c = await lockForMember(tx, connectionId, userId);
    if (!c) return fail("not_found");
    if (c.status === "ended") return fail("connection_not_active");
    if (!isAllowedRevealTime(time)) return fail("invalid_reveal_time");
    await tx
      .update(connections)
      .set({ proposedRevealTime: time, proposedBy: userId, proposedAt: now })
      .where(eq(connections.id, c.id));
    return ok(undefined);
  });
}

export async function acceptProposal(
  db: Db,
  input: { connectionId: string; userId: string; now: Date },
): Promise<AccessResult<void>> {
  const { connectionId, userId, now } = input;
  return db.transaction(async (tx) => {
    const c = await lockForMember(tx, connectionId, userId);
    if (!c) return fail("not_found");
    if (c.status === "ended") return fail("connection_not_active");
    if (!c.proposedRevealTime) return fail("invalid_input");
    if (c.proposedBy === userId) return fail("forbidden");

    const change =
      c.status === "pending"
        ? { status: "active" as const, revealTime: c.proposedRevealTime }
        : {
            previousRevealTime: c.revealTime,
            revealTime: c.proposedRevealTime,
            revealTimeChangedAt: now,
          };
    await tx
      .update(connections)
      .set({ ...change, ...NO_PROPOSAL })
      .where(eq(connections.id, c.id));
    return ok(undefined);
  });
}

export async function rejectProposal(
  db: Db,
  input: { connectionId: string; userId: string; now: Date },
): Promise<AccessResult<void>> {
  const { connectionId, userId, now } = input;
  return db.transaction(async (tx) => {
    const c = await lockForMember(tx, connectionId, userId);
    if (!c) return fail("not_found");
    if (c.status === "ended") return fail("connection_not_active");
    if (!c.proposedRevealTime) return fail("invalid_input");

    if (c.status === "pending") {
      await closeConnection(tx, c.id, now);
    } else {
      await tx.update(connections).set(NO_PROPOSAL).where(eq(connections.id, c.id));
    }
    return ok(undefined);
  });
}

export async function endConnection(
  db: Db,
  input: { connectionId: string; userId: string; now: Date },
): Promise<AccessResult<void>> {
  const { connectionId, userId, now } = input;
  return db.transaction(async (tx) => {
    const c = await lockForMember(tx, connectionId, userId);
    if (!c) return fail("not_found");
    if (c.status !== "ended") await closeConnection(tx, c.id, now);
    return ok(undefined);
  });
}
