"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { blockUser, unblockUser } from "@/lib/access/blocks";
import {
  acceptProposal,
  endConnection,
  getConnectionForMember,
  proposeRevealTime,
  rejectProposal,
} from "@/lib/access/connections";
import type { AccessResult } from "@/lib/access/errors";
import { safeNextPath } from "@/lib/auth/next-path";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getRequestClock } from "@/lib/clock/request";
import { db } from "@/lib/db/client";
import { errorMessage, type ActionResult } from "@/lib/messages";

const connectionSchema = z.object({ connectionId: z.uuid() });
const proposalSchema = connectionSchema.extend({ time: z.string() });
const blockedSchema = z.object({ blockedId: z.string().min(1) });

const INVALID: ActionResult = { error: errorMessage("invalid_input") };

async function requestContext() {
  const [user, clock] = await Promise.all([requireOnboardedUser(), getRequestClock()]);
  return { userId: user.id, now: clock.now() };
}

function finish(result: AccessResult<unknown>, redirectTo: string): ActionResult {
  if (!result.ok) return { error: errorMessage(result.error) };
  // Cambia sia la home sia il canale.
  revalidatePath("/", "layout");
  return { redirectTo };
}

const channelPath = (connectionId: string) => `/persone/${connectionId}`;

export async function proposeTimeAction(formData: FormData): Promise<ActionResult> {
  const { userId, now } = await requestContext();
  const input = proposalSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return INVALID;
  const result = await proposeRevealTime(db, { ...input.data, userId, now });
  return finish(result, channelPath(input.data.connectionId));
}

export async function acceptProposalAction(formData: FormData): Promise<ActionResult> {
  const { userId, now } = await requestContext();
  const input = connectionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return INVALID;
  const result = await acceptProposal(db, { ...input.data, userId, now });
  return finish(result, safeNextPath(formData.get("returnTo")) ?? "/");
}

export async function rejectProposalAction(formData: FormData): Promise<ActionResult> {
  const { userId, now } = await requestContext();
  const input = connectionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return INVALID;
  const result = await rejectProposal(db, { ...input.data, userId, now });
  return finish(result, channelPath(input.data.connectionId));
}

export async function endConnectionAction(formData: FormData): Promise<ActionResult> {
  const { userId, now } = await requestContext();
  const input = connectionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return INVALID;
  const result = await endConnection(db, { ...input.data, userId, now });
  return finish(result, "/");
}

/** La persona da bloccare si ricava dalla connessione: non è il browser a dire chi è. */
export async function blockAction(formData: FormData): Promise<ActionResult> {
  const { userId, now } = await requestContext();
  const input = connectionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return INVALID;
  const connection = await getConnectionForMember(db, { ...input.data, userId, now });
  if (!connection.ok) return { error: errorMessage(connection.error) };
  const result = await blockUser(db, {
    blockerId: userId,
    blockedId: connection.value.partner.id,
    now,
  });
  return finish(result, "/");
}

export async function unblockAction(formData: FormData): Promise<ActionResult> {
  const { userId } = await requestContext();
  const input = blockedSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return INVALID;
  const result = await unblockUser(db, { blockerId: userId, blockedId: input.data.blockedId });
  return finish(result, "/impostazioni");
}
