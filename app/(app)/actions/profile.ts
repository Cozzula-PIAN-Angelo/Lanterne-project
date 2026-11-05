"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AccessResult } from "@/lib/access/errors";
import { saveProfile } from "@/lib/access/profile";
import { safeNextPath } from "@/lib/auth/next-path";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export async function updateProfileAction(formData: FormData): Promise<AccessResult<void>> {
  const user = await requireUser();
  const result = await saveProfile(db, user.id, {
    name: formData.get("name"),
    color: formData.get("color"),
    timezone: formData.get("timezone"),
  });
  if (!result.ok) return result;
  // Il nome, il colore e il fuso si leggono anche nel layout, che resta montato tra le pagine.
  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next")) ?? "/");
}
