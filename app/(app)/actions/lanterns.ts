"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AccessResult } from "@/lib/access/errors";
import {
  createTextLantern,
  createThoughtLantern,
  deleteLantern,
  reactToLantern,
  saveLantern,
} from "@/lib/access/lanterns";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getRequestClock } from "@/lib/clock/request";
import { db } from "@/lib/db/client";
import { errorMessage, type ActionResult } from "@/lib/messages";

const textSchema = z.object({ connectionId: z.uuid(), text: z.string() });
const thoughtSchema = z.object({ connectionId: z.uuid(), thoughtId: z.string() });
const lanternSchema = z.object({ connectionId: z.uuid(), lanternId: z.uuid() });
const reactionSchema = lanternSchema.extend({ reaction: z.string() });

const INVALID: ActionResult = { error: errorMessage("invalid_input") };

async function requestContext() {
  const [user, clock] = await Promise.all([requireOnboardedUser(), getRequestClock()]);
  return { userId: user.id, now: clock.now() };
}

function finish(result: AccessResult<unknown>, connectionId: string): ActionResult {
  if (!result.ok) return { error: errorMessage(result.error) };
  const path = `/persone/${connectionId}`;
  revalidatePath(path);
  return { redirectTo: path };
}

export async function sendTextAction(formData: FormData): Promise<ActionResult> {
  const { userId, now } = await requestContext();
  const input = textSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return INVALID;
  const result = await createTextLantern(db, { ...input.data, senderId: userId, now });
  return finish(result, input.data.connectionId);
}

export async function sendThoughtAction(formData: FormData): Promise<ActionResult> {
  const { userId, now } = await requestContext();
  const input = thoughtSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return INVALID;
  const result = await createThoughtLantern(db, { ...input.data, senderId: userId, now });
  return finish(result, input.data.connectionId);
}

export async function deleteLanternAction(formData: FormData): Promise<ActionResult> {
  const { userId, now } = await requestContext();
  const input = lanternSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return INVALID;
  const result = await deleteLantern(db, { lanternId: input.data.lanternId, userId, now });
  return finish(result, input.data.connectionId);
}

/** Una reazione vuota toglie quella già messa. */
export async function reactAction(formData: FormData): Promise<ActionResult> {
  const { userId, now } = await requestContext();
  const input = reactionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return INVALID;
  const { lanternId, reaction, connectionId } = input.data;
  const result = await reactToLantern(db, { lanternId, reaction: reaction || null, userId, now });
  return finish(result, connectionId);
}

export async function saveAction(formData: FormData): Promise<ActionResult> {
  const { userId, now } = await requestContext();
  const input = lanternSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return INVALID;
  const result = await saveLantern(db, { lanternId: input.data.lanternId, userId, now });
  return finish(result, input.data.connectionId);
}
