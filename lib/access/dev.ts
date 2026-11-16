import { and, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { connections, lanterns, user } from "@/lib/db/schema";
import { computeExpiresAt } from "@/lib/time/lantern-times";
import { fail, ok, type AccessResult } from "./errors";

/** Il tasto "Fai arrivare adesso" esiste solo in sviluppo. */
export function canArriveNow(nodeEnv: string | undefined): boolean {
  return nodeEnv === "development";
}

/**
 * Fa arrivare subito le lanterne in attesa del canale, in entrambe le direzioni.
 * A differenza del viaggio nel tempo cambia il database: il worker, che segue l'ora reale, notifica al giro dopo.
 * Solo per un membro di una connessione attiva; altrimenti `not_found`, come `getChannel`.
 */
export async function arriveNow(
  db: Db,
  input: { connectionId: string; userId: string; now: Date },
): Promise<AccessResult<{ count: number }>> {
  return db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(connections)
      .where(eq(connections.id, input.connectionId))
      .for("update");
    const isMember = connection && [connection.userAId, connection.userBId].includes(input.userId);
    if (!connection || !isMember || connection.status !== "active") return fail("not_found");

    const people = await tx
      .select({ id: user.id, timezone: user.timezone })
      .from(user)
      .where(inArray(user.id, [connection.userAId, connection.userBId]));
    const tzOf = new Map(people.map((p) => [p.id, p.timezone ?? "UTC"]));

    let count = 0;
    for (const recipientId of [connection.userAId, connection.userBId]) {
      const updated = await tx
        .update(lanterns)
        .set({
          revealAt: input.now,
          expiresAt: computeExpiresAt(input.now, tzOf.get(recipientId) ?? "UTC"),
        })
        .where(
          and(
            eq(lanterns.connectionId, connection.id),
            eq(lanterns.recipientId, recipientId),
            eq(lanterns.status, "ready"),
            gt(lanterns.revealAt, input.now),
          ),
        )
        .returning({ id: lanterns.id });
      count += updated.length;
    }
    return ok({ count });
  });
}
