"use client";

import { useState } from "react";
import { acceptInviteAction } from "@/app/(app)/actions/invites";
import { RevealTimeSelect } from "@/components/reveal-time-select";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/components/use-action-form";

export function InviteAcceptForm({ code, proposedTime }: { code: string; proposedTime: string }) {
  const [error, formAction, pending] = useActionForm(acceptInviteAction);
  const [proposing, setProposing] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="code" value={code} />
      {/*
        Le key sono necessarie. Senza, React riusa lo stesso <button> passando da type="button" a
        type="submit" mentre il click è in corso, e il browser invia il form con l'orario di default.
      */}
      {proposing ? (
        <>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Orario</span>
            <RevealTimeSelect name="counterProposal" defaultValue={proposedTime} />
          </label>
          <Button key="send-proposal" type="submit" size="lg" disabled={pending} className="w-full">
            Proponi questo orario
          </Button>
          <Button
            key="cancel"
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setProposing(false)}
          >
            Annulla
          </Button>
        </>
      ) : (
        <>
          <Button key="accept" type="submit" size="lg" disabled={pending} className="w-full">
            Accetta
          </Button>
          <Button
            key="propose"
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setProposing(true)}
          >
            Proponi un altro orario
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
