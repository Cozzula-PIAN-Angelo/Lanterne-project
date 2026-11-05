"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { acceptProposal } from "@/lib/access/connections";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getRequestClock } from "@/lib/clock/request";
import { db } from "@/lib/db/client";
import { errorMessage, type ActionResult } from "@/lib/messages";

const connectionSchema = z.object({ connectionId: z.uuid() });

export async function acceptProposalAction(formData: FormData): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const input = connectionSchema.safeParse({ connectionId: formData.get("connectionId") });
  if (!input.success) return { error: errorMessage("invalid_input") };

  const result = await acceptProposal(db, {
    connectionId: input.data.connectionId,
    userId: user.id,
    now: (await getRequestClock()).now(),
  });
  if (!result.ok) return { error: errorMessage(result.error) };

  revalidatePath("/");
  return { redirectTo: "/" };
}
