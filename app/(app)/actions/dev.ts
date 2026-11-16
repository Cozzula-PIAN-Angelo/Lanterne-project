"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { arriveNow, canArriveNow } from "@/lib/access/dev";
import { requireOnboardedUser } from "@/lib/auth/session";
import { DEV_OFFSET_COOKIE, devOffsetCookieValue, systemClock } from "@/lib/clock/clock";
import { db } from "@/lib/db/client";
import { errorMessage } from "@/lib/messages";

/** Sposta l'orologio del server per questo browser. Solo in sviluppo. */
export async function setDevOffsetAction(ms: number): Promise<void> {
  const value = devOffsetCookieValue(ms, process.env.NODE_ENV);
  (await cookies()).set(DEV_OFFSET_COOKIE, value, { path: "/", sameSite: "lax", httpOnly: true });
}

const arriveSchema = z.object({ connectionId: z.uuid() });

/** Fa arrivare adesso le lanterne in attesa del canale. Solo in sviluppo, con l'ora reale: il worker segue quella. */
export async function devArriveNowAction(formData: FormData): Promise<{ count: number } | { error: string }> {
  if (!canArriveNow(process.env.NODE_ENV)) return { error: "Disponibile solo in sviluppo." };
  const input = arriveSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: errorMessage("invalid_input") };
  const user = await requireOnboardedUser();
  const result = await arriveNow(db, { connectionId: input.data.connectionId, userId: user.id, now: systemClock.now() });
  if (!result.ok) return { error: errorMessage(result.error) };
  revalidatePath(`/persone/${input.data.connectionId}`);
  return result.value;
}
