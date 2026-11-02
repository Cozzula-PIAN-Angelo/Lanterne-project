import { and, count, eq, inArray, or } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { connections } from "@/lib/db/schema";

/** Connessioni che occupano un posto: active + pending. */
export async function countOpenConnections(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(connections)
    .where(
      and(
        or(eq(connections.userAId, userId), eq(connections.userBId, userId)),
        inArray(connections.status, ["active", "pending"]),
      ),
    );
  return row.n;
}
