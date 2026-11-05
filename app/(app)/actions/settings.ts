"use server";

import { revalidatePath } from "next/cache";
import { setAllowSaving, updateTimezone } from "@/lib/access/profile";
import { requireOnboardedUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { errorMessage, type ActionResult } from "@/lib/messages";

export async function updateTimezoneAction(formData: FormData): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const result = await updateTimezone(db, user.id, String(formData.get("timezone") ?? ""));
  if (!result.ok) return { error: errorMessage(result.error) };
  revalidatePath("/", "layout");
  return { redirectTo: "/" };
}

export async function setAllowSavingAction(formData: FormData): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const result = await setAllowSaving(db, user.id, formData.get("allowSaving") === "on");
  if (!result.ok) return { error: errorMessage(result.error) };
  revalidatePath("/impostazioni");
  return { redirectTo: "/impostazioni" };
}
