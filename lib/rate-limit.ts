import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * Finestra fissa: la prima richiesta apre la finestra, che si azzera quando
 * now ≥ windowStart + windowSec. Un solo upsert atomico per richiesta.
 */
export async function checkRateLimit(
  db: DbOrTx,
  input: { key: string; limit: number; windowSec: number; now: Date },
): Promise<RateLimitResult> {
  const { key, limit, windowSec, now } = input;
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const expired = sql`${rateLimits.windowStart} + make_interval(secs => ${windowSec}) <= ${nowSql}`;

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        windowStart: sql`CASE WHEN ${expired} THEN ${nowSql} ELSE ${rateLimits.windowStart} END`,
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
      },
    })
    .returning({ windowStart: rateLimits.windowStart, count: rateLimits.count });

  if (row.count <= limit) return { ok: true };
  const windowEndMs = row.windowStart.getTime() + windowSec * 1000;
  return { ok: false, retryAfterSec: Math.ceil((windowEndMs - now.getTime()) / 1000) };
}
