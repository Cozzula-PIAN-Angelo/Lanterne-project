import { and, eq, or } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { blocks } from "@/lib/db/schema";

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
