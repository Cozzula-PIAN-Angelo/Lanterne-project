"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/messages";

/** Collega un form a una Server Action: tiene l'errore da mostrare e segue il redirect. */
export function useActionForm(action: (formData: FormData) => Promise<ActionResult>) {
  const router = useRouter();
  return useActionState(async (_prev: string | null, formData: FormData) => {
    const result = await action(formData);
    if ("error" in result) return result.error;
    router.push(result.redirectTo);
    return null;
  }, null);
}
