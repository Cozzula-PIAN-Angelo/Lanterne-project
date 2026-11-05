"use client";

import { acceptProposalAction } from "@/app/(app)/actions/connections";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/components/use-action-form";

export function AcceptProposalButton({ connectionId }: { connectionId: string }) {
  const [error, formAction, pending] = useActionForm(acceptProposalAction);
  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="connectionId" value={connectionId} />
      <Button type="submit" disabled={pending}>
        Accetta
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
