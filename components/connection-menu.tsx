"use client";

import { useState } from "react";
import {
  acceptProposalAction,
  blockAction,
  endConnectionAction,
  proposeTimeAction,
  rejectProposalAction,
} from "@/app/(app)/actions/connections";
import { ActionButton } from "@/components/action-button";
import { RevealTimeSelect } from "@/components/reveal-time-select";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/components/use-action-form";
import type { ActionResult } from "@/lib/messages";
import { revealTimeName } from "@/lib/time/format";

type Props = {
  connectionId: string;
  partnerName: string;
  status: "pending" | "active";
  revealTime: string | null;
  proposedRevealTime: string | null;
  proposedByMe: boolean;
};

function Proposal({ connectionId, partnerName, status, proposedRevealTime, proposedByMe }: Omit<Props, "revealTime">) {
  const [confirmingReject, setConfirmingReject] = useState(false);
  if (!proposedRevealTime) return null;
  const time = revealTimeName(proposedRevealTime);
  if (proposedByMe) return <p className="text-sm">Hai proposto {time}: aspettiamo {partnerName}.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm">
        {partnerName} propone {time}
      </p>
      <div className="flex gap-2">
        <ActionButton
          action={acceptProposalAction}
          fields={{ connectionId, returnTo: `/persone/${connectionId}` }}
        >
          Accetta
        </ActionButton>
        {status === "pending" ? (
          <Button type="button" variant="outline" onClick={() => setConfirmingReject(true)}>
            Rifiuta
          </Button>
        ) : (
          <ActionButton action={rejectProposalAction} fields={{ connectionId }} variant="outline">
            Rifiuta
          </ActionButton>
        )}
      </div>
      {/* Senza un orario già concordato, rifiutare chiude la connessione: va detto prima. */}
      {confirmingReject && (
        <Confirm
          text="Se rifiuti, la connessione si chiude. Puoi proporre un altro orario, invece."
          confirmLabel="Sì, rifiuta"
          action={rejectProposalAction}
          connectionId={connectionId}
          onCancel={() => setConfirmingReject(false)}
        />
      )}
    </div>
  );
}

type ChangeTimeProps = Pick<Props, "connectionId" | "partnerName" | "status" | "revealTime" | "proposedRevealTime"> & {
  onDone: () => void;
};

function ChangeTime({ connectionId, partnerName, status, revealTime, proposedRevealTime, onDone }: ChangeTimeProps) {
  const [error, formAction, pending] = useActionForm(async (formData) => {
    const result = await proposeTimeAction(formData);
    if ("redirectTo" in result) onDone();
    return result;
  });
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="connectionId" value={connectionId} />
      <p className="text-sm text-muted-foreground">
        {status === "active"
          ? `Il nuovo orario varrà da domani, se ${partnerName} accetta`
          : `Le lanterne potranno partire quando ${partnerName} accetta`}
        {proposedRevealTime && ". Prende il posto della proposta in attesa."}
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Orario</span>
        <RevealTimeSelect name="time" defaultValue={proposedRevealTime ?? revealTime ?? undefined} />
      </label>
      <Button type="submit" disabled={pending}>
        Proponi
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

type ConfirmProps = {
  text: string;
  confirmLabel: string;
  action: (formData: FormData) => Promise<ActionResult>;
  connectionId: string;
  onCancel: () => void;
};

function Confirm({ text, confirmLabel, action, connectionId, onCancel }: ConfirmProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm">{text}</p>
      <div className="flex gap-2">
        <ActionButton action={action} fields={{ connectionId }} variant="destructive">
          {confirmLabel}
        </ActionButton>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </div>
  );
}

export function ConnectionMenu(props: Props) {
  const { connectionId, partnerName, status, revealTime, proposedRevealTime } = props;
  const [panel, setPanel] = useState<"time" | "end" | "block" | null>(null);
  const toggle = (next: "time" | "end" | "block") => setPanel((open) => (open === next ? null : next));
  const close = () => setPanel(null);

  return (
    <section aria-label="Gestisci la connessione" className="space-y-3 border-t pt-4">
      <Proposal {...props} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => toggle("time")}>
          Cambia orario
        </Button>
        <Button type="button" variant="outline" onClick={() => toggle("end")}>
          Chiudi la connessione
        </Button>
        <Button type="button" variant="outline" onClick={() => toggle("block")}>
          Blocca
        </Button>
      </div>

      {panel === "time" && (
        <ChangeTime
          connectionId={connectionId}
          partnerName={partnerName}
          status={status}
          revealTime={revealTime}
          proposedRevealTime={proposedRevealTime}
          onDone={close}
        />
      )}
      {panel === "end" && (
        <Confirm
          text="Le lanterne non conservate verranno eliminate, anche quelle già arrivate. I ricordi restano."
          confirmLabel="Sì, chiudi"
          action={endConnectionAction}
          connectionId={connectionId}
          onCancel={close}
        />
      )}
      {panel === "block" && (
        <Confirm
          text={`${partnerName} non potrà più invitarti e le tue lanterne che ha conservato verranno eliminate.`}
          confirmLabel="Sì, blocca"
          action={blockAction}
          connectionId={connectionId}
          onCancel={close}
        />
      )}
    </section>
  );
}
