"use server";

import { removePushSubscription, savePushSubscription } from "@/lib/access/push";
import { requireOnboardedUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { errorMessage } from "@/lib/messages";

export async function savePushAction(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const user = await requireOnboardedUser();
  const result = await savePushSubscription(db, {
    userId: user.id,
    endpoint: String(formData.get("endpoint") ?? ""),
    p256dh: String(formData.get("p256dh") ?? ""),
    auth: String(formData.get("auth") ?? ""),
  });
  return result.ok ? { ok: true } : { error: errorMessage(result.error) };
}

/** Una sottoscrizione già assente va bene: chi la toglie vuole solo che non ci sia. */
export async function removePushAction(formData: FormData): Promise<void> {
  const user = await requireOnboardedUser();
  await removePushSubscription(db, { userId: user.id, endpoint: String(formData.get("endpoint") ?? "") });
}
