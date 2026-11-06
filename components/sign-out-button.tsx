"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import { dropPushSubscription } from "@/lib/client/push";

export function SignOutButton() {
  const [failed, setFailed] = useState(false);

  async function signOut() {
    // Prima di chiudere la sessione, che serve per togliere la riga. Su un telefono condiviso
    // le notifiche, con i nomi delle persone, non devono arrivare a chi entra dopo.
    await dropPushSubscription();
    const { error } = await authClient.signOut();
    if (error) {
      setFailed(true);
      return;
    }
    // Ricarica vera: le pagine già visitate restano in memoria e non devono sopravvivere all'uscita.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/accedi");
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" onClick={signOut}>
        Esci
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Non è andata: riprova tra un momento.
        </p>
      )}
    </div>
  );
}
