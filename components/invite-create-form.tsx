"use client";

import { createInviteAction } from "@/app/(app)/actions/invites";
import { RevealTimeSelect } from "@/components/reveal-time-select";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/components/use-action-form";

export function InviteCreateForm() {
  const [error, formAction, pending] = useActionForm(createInviteAction);
  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Orario</span>
        <RevealTimeSelect name="revealTime" defaultValue="21:30" />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        Crea il link
      </Button>
    </form>
  );
}
