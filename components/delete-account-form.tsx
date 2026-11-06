"use client";

import { useActionState } from "react";
import { deleteAccountAction } from "@/app/(app)/actions/account";
import { Button } from "@/components/ui/button";

export function DeleteAccountForm() {
  const [error, formAction, pending] = useActionState(async (_previous: string | null, formData: FormData) => {
    try {
      const result = await deleteAccountAction(formData);
      if ("error" in result) return result.error;
      // Ricarica vera: le pagine già visitate restano in memoria e non devono sopravvivere all'account.
      window.location.assign(result.redirectTo);
      return null;
    } catch {
      return "Non è andata: riprova tra un momento.";
    }
  }, null);

  return (
    <section aria-label="Elimina l'account" className="space-y-3 border-t pt-4">
      <h2 className="text-lg font-medium">Elimina l&apos;account</h2>
      <p className="text-sm">
        Spariscono il tuo profilo, le tue connessioni e tutte le lanterne, anche quelle che altri avevano conservato.
        Non si può annullare.
      </p>
      <form action={formAction} className="space-y-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Scrivi ELIMINA per confermare</span>
          <input
            name="confirmation"
            required
            autoComplete="off"
            autoCapitalize="characters"
            className="w-full rounded-lg border px-3 py-2"
          />
        </label>
        <Button type="submit" variant="destructive" disabled={pending}>
          Elimina l&apos;account
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
