"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { acceptInvite, createInvite } from "@/lib/access/invites";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getRequestClock } from "@/lib/clock/request";
import { db } from "@/lib/db/client";
import { errorMessage, type ActionResult } from "@/lib/messages";

const createSchema = z.object({ revealTime: z.string() });

const acceptSchema = z.object({
  code: z.string().min(1).max(64),
  counterProposal: z.string().optional(),
});

export async function createInviteAction(formData: FormData): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const input = createSchema.safeParse({ revealTime: formData.get("revealTime") });
  if (!input.success) return { error: errorMessage("invalid_input") };

  const result = await createInvite(db, {
    userId: user.id,
    proposedRevealTime: input.data.revealTime,
    now: (await getRequestClock()).now(),
  });
  if (!result.ok) return { error: errorMessage(result.error) };

  revalidatePath("/");
  return { redirectTo: `/invita?code=${encodeURIComponent(result.value.code)}` };
}

export async function acceptInviteAction(formData: FormData): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const input = acceptSchema.safeParse({
    code: formData.get("code"),
    counterProposal: formData.get("counterProposal") ?? undefined,
  });
  if (!input.success) return { error: errorMessage("invalid_input") };

  const result = await acceptInvite(db, {
    ...input.data,
    userId: user.id,
    now: (await getRequestClock()).now(),
  });
  if (!result.ok) return { error: errorMessage(result.error) };

  revalidatePath("/");
  return { redirectTo: "/" };
}
