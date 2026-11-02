"use server";

import { redirect } from "next/navigation";
import type { AccessResult } from "@/lib/access/errors";
import { saveProfile } from "@/lib/access/profile";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";

export async function updateProfileAction(formData: FormData): Promise<AccessResult<void>> {
  const user = await requireUser();
  const result = await saveProfile(db, user.id, {
    name: formData.get("name"),
    color: formData.get("color"),
    timezone: formData.get("timezone"),
  });
  if (result.ok) redirect("/");
  return result;
}
