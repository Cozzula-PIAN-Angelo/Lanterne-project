"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { confirmMediaLantern, createMediaLantern, getMediaUrl } from "@/lib/access/media";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getRequestClock } from "@/lib/clock/request";
import { db } from "@/lib/db/client";
import { errorMessage, type ActionResult } from "@/lib/messages";
import { storage } from "@/lib/storage/client";

const requestSchema = z.object({
  connectionId: z.uuid(),
  type: z.enum(["audio", "photo"]),
  mime: z.string(),
  bytes: z.number().int(),
  durationSec: z.number().int().optional(),
});
const confirmSchema = z.object({ connectionId: z.uuid(), lanternId: z.uuid() });
const urlSchema = z.object({ lanternId: z.uuid() });

const INVALID = { error: errorMessage("invalid_input") };

export type UploadTicket = {
  lanternId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  revealAt: string;
};

export async function requestUploadAction(input: {
  connectionId: string;
  type: "audio" | "photo";
  mime: string;
  bytes: number;
  durationSec?: number;
}): Promise<{ error: string } | UploadTicket> {
  const [user, clock] = await Promise.all([requireOnboardedUser(), getRequestClock()]);
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await createMediaLantern(db, storage, {
    ...parsed.data,
    senderId: user.id,
    now: clock.now(),
  });
  if (!result.ok) return { error: errorMessage(result.error) };
  return { ...result.value, revealAt: result.value.revealAt.toISOString() };
}

export async function confirmUploadAction(input: {
  connectionId: string;
  lanternId: string;
}): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await confirmMediaLantern(db, storage, {
    lanternId: parsed.data.lanternId,
    userId: user.id,
  });
  if (!result.ok) return { error: errorMessage(result.error) };
  const path = `/persone/${parsed.data.connectionId}`;
  revalidatePath(path);
  return { redirectTo: path };
}

export async function mediaUrlAction(input: {
  lanternId: string;
}): Promise<{ error: string } | { url: string; mime: string }> {
  const [user, clock] = await Promise.all([requireOnboardedUser(), getRequestClock()]);
  const parsed = urlSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await getMediaUrl(db, storage, {
    lanternId: parsed.data.lanternId,
    userId: user.id,
    now: clock.now(),
  });
  return result.ok ? result.value : { error: errorMessage(result.error) };
}
