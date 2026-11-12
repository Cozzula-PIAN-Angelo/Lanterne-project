"use server";

import { deleteAccount } from "@/lib/access/account";
import { requireOnboardedUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { errorMessage, type ActionResult } from "@/lib/messages";

export async function deleteAccountAction(formData: FormData): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const result = await deleteAccount(db, {
    userId: user.id,
    confirmation: String(formData.get("confirmation") ?? ""),
  });
  if (result.ok) return { redirectTo: "/accedi" };
  return { error: result.error === "invalid_input" ? "Per confermare scrivi ELIMINA." : errorMessage(result.error) };
}
