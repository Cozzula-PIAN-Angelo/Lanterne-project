import { and, asc, eq, isNull, lt, lte } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { lanterns, storageDeletions } from "@/lib/db/schema";
import type { MediaStorage } from "@/lib/storage/s3";

const ONE_HOUR_MS = 60 * 60 * 1000;
const DRAIN_DEFAULT_LIMIT = 100;

/** Le lanterne si cancellano qui; i loro file li mette in coda il trigger del database. */
export async function cleanupExpired(db: Db, { now }: { now: Date }): Promise<{ deleted: number }> {
  const deleted = await db
    .delete(lanterns)
    .where(and(lt(lanterns.expiresAt, now), isNull(lanterns.savedAt)))
    .returning({ id: lanterns.id });
  return { deleted: deleted.length };
}

export async function cleanupAbandoned(db: Db, { now }: { now: Date }): Promise<{ deleted: number }> {
  const deleted = await db
    .delete(lanterns)
    .where(and(eq(lanterns.status, "uploading"), lt(lanterns.createdAt, new Date(now.getTime() - ONE_HOUR_MS))))
    .returning({ id: lanterns.id });
  return { deleted: deleted.length };
}

/**
 * Toglie i file dallo storage. Le chiavi aspettano un'ora in coda perché un upload già
 * iniziato può finire dopo la cancellazione della riga: toglierle subito lascerebbe
 * un file privato per sempre, senza riga e senza coda.
 */
export async function drainStorageDeletions(
  db: Db,
  storage: Pick<MediaStorage, "remove">,
  { now, limit = DRAIN_DEFAULT_LIMIT }: { now: Date; limit?: number },
): Promise<{ removed: number; failed: number }> {
  const queued = await db
    .select({ key: storageDeletions.key })
    .from(storageDeletions)
    .where(lte(storageDeletions.createdAt, new Date(now.getTime() - ONE_HOUR_MS)))
    .orderBy(asc(storageDeletions.createdAt), asc(storageDeletions.key))
    .limit(limit);

  let removed = 0;
  let failed = 0;
  for (const { key } of queued) {
    try {
      await storage.remove(key);
      await db.delete(storageDeletions).where(eq(storageDeletions.key, key));
      removed += 1;
    } catch {
      // La chiave resta in coda e si riprova al prossimo giro.
      failed += 1;
    }
  }
  return { removed, failed };
}
