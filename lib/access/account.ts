import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { fail, ok, type AccessResult } from "./errors";

const CONFIRMATION = "ELIMINA";

/**
 * Basta eliminare la riga `user`: le cascate tolgono sessioni, connessioni e lanterne,
 * e il trigger su `lanterns` mette in coda i file.
 */
export async function deleteAccount(
  db: Db,
  input: { userId: string; confirmation: string },
): Promise<AccessResult<void>> {
  if (input.confirmation.trim() !== CONFIRMATION) return fail("invalid_input");
  const deleted = await db.delete(user).where(eq(user.id, input.userId)).returning({ id: user.id });
  return deleted.length > 0 ? ok(undefined) : fail("not_found");
}
