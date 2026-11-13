"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { devArriveNowAction } from "@/app/(app)/actions/dev";
import { Button } from "@/components/ui/button";

/** Fa arrivare subito le lanterne in attesa, cambiando il database: il worker notifica davvero. Solo in sviluppo. */
export function DevArriveNow({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = () =>
    startTransition(async () => {
      const formData = new FormData();
      formData.set("connectionId", connectionId);
      const result = await devArriveNowAction(formData);
      if ("error" in result) setMessage(result.error);
      else if (result.count === 0) setMessage("Nessuna lanterna in attesa.");
      else setMessage(`Arrivate adesso: ${result.count} ${result.count === 1 ? "lanterna" : "lanterne"}`);
      router.refresh();
    });

  return (
    <aside aria-label="Arrivo immediato" className="space-y-2 rounded-xl border border-dashed p-3 text-sm">
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={run}>
        Fai arrivare adesso
      </Button>
      {message && <p role="status">{message}</p>}
    </aside>
  );
}
