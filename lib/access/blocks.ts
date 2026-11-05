import { and, asc, eq, ne, or } from "drizzle-orm";
import type { Db, DbOrTx } from "@/lib/db/client";
import { blocks, connections, lanterns, user } from "@/lib/db/schema";
import { closeConnection, lockUsers } from "./connections";
import { fail, ok, type AccessResult } from "./errors";

/** true se a ha bloccato b oppure b ha bloccato a. */
export async function isBlockedEitherWay(db: DbOrTx, a: string, b: string): Promise<boolean> {
  const rows = await db
    .select({ blockerId: blocks.blockerId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
        and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Blocco silenzioso: chiude la connessione aperta (come endConnection) ed elimina
 * tutte le lanterne che il bloccante ha mandato al bloccato, anche quelle salvate.
 */
export async function blockUser(
  db: Db,
  input: { blockerId: string; blockedId: string; now: Date },
): Promise<AccessResult<void>> {
  const { blockerId, blockedId, now } = input;
  if (blockerId === blockedId) return fail("invalid_input");

  return db.transaction(async (tx) => {
    const found = await lockUsers(tx, [blockerId, blockedId]);
    if (found.length < 2) return fail("not_found");

    await tx
      .insert(blocks)
      .values({ blockerId, blockedId, createdAt: now })
      .onConflictDoNothing();

    const [userAId, userBId] = [blockerId, blockedId].sort();
    const open = await tx
      .select({ id: connections.id })
      .from(connections)
      .where(
        and(
          eq(connections.userAId, userAId),
          eq(connections.userBId, userBId),
          ne(connections.status, "ended"),
        ),
      )
      .for("update");
    for (const c of open) await closeConnection(tx, c.id, now);

    await tx
      .delete(lanterns)
      .where(and(eq(lanterns.senderId, blockerId), eq(lanterns.recipientId, blockedId)));
    return ok(undefined);
  });
}

export async function unblockUser(
  db: Db,
  input: { blockerId: string; blockedId: string },
): Promise<AccessResult<void>> {
  await db
    .delete(blocks)
    .where(and(eq(blocks.blockerId, input.blockerId), eq(blocks.blockedId, input.blockedId)));
  return ok(undefined);
}

export async function listBlocked(db: Db, blockerId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(blocks)
    .innerJoin(user, eq(user.id, blocks.blockedId))
    .where(eq(blocks.blockerId, blockerId))
    .orderBy(asc(user.name));
}
