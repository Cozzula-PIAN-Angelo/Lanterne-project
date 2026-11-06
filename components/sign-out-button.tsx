"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import { outboxStore } from "@/lib/client/outbox-store";
import { dropPushSubscription } from "@/lib/client/push";

export function SignOutButton({ userId }: { userId: string }) {
  const [failed, setFailed] = useState(false);
  const [queued, setQueued] = useState(0);

  async function askFirst() {
    setFailed(false);
    const count = (await outboxStore.list(userId)).length;
    if (count > 0) setQueued(count);
    else await signOut();
  }

  async function signOut() {
    // Prima di chiudere la sessione, che serve per togliere la riga. Su un telefono condiviso
    // le notifiche, con i nomi delle persone, non devono arrivare a chi entra dopo.
    await dropPushSubscription();
    const { error } = await authClient.signOut();
    if (error) {
      setQueued(0);
      setFailed(true);
      return;
    }
    // Solo a uscita riuscita: finché si resta dentro, i vocali possono ancora partire.
    await outboxStore.clear(userId);
    // Ricarica vera: le pagine già visitate restano in memoria e non devono sopravvivere all'uscita.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/accedi");
  }

  return (
    <div className="space-y-1">
      {queued > 0 ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm">
            {queued === 1
              ? "Hai 1 lanterna non ancora partita: uscendo verrà cancellata"
              : `Hai ${queued} lanterne non ancora partite: uscendo verranno cancellate`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="destructive" onClick={signOut}>
              Esci e cancella
            </Button>
            <Button type="button" variant="outline" onClick={() => setQueued(0)}>
              Annulla
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={askFirst}>
          Esci
        </Button>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Non è andata: riprova tra un momento.
        </p>
      )}
    </div>
  );
}
