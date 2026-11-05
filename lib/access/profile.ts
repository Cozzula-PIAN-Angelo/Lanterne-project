import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { COLORS } from "@/lib/lanterns/constants";
import { isValidTimeZone } from "@/lib/time/timezone";
import { fail, ok, type AccessResult } from "./errors";

const COLOR_HEXES: readonly string[] = COLORS.map((c) => c.hex);

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().refine((c) => COLOR_HEXES.includes(c)),
  timezone: z.string().refine(isValidTimeZone),
});

export function isOnboarded(u: { color: string | null }): boolean {
  return u.color !== null;
}

export async function saveProfile(
  db: Db,
  userId: string,
  input: unknown,
): Promise<AccessResult<void>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  await db.update(user).set(parsed.data).where(eq(user.id, userId));
  return ok(undefined);
}

export async function updateTimezone(db: Db, userId: string, tz: string): Promise<AccessResult<void>> {
  if (!isValidTimeZone(tz)) return fail("invalid_input");
  await db.update(user).set({ timezone: tz }).where(eq(user.id, userId));
  return ok(undefined);
}

/** Vale per le lanterne inviate da ora in poi: le altre tengono la scelta di quando sono partite. */
export async function setAllowSaving(db: Db, userId: string, value: boolean): Promise<AccessResult<void>> {
  await db.update(user).set({ allowSaving: value }).where(eq(user.id, userId));
  return ok(undefined);
}
