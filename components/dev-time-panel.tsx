"use client";

import { useTransition } from "react";
import { setDevOffsetAction } from "@/app/(app)/actions/dev";
import { Button } from "@/components/ui/button";

const HOUR_MS = 60 * 60 * 1000;

type Props = {
  offsetMs: number;
  /** Lo spostamento che porta alle prossime 08:00 locali: lo calcola il server, che conosce il fuso. */
  morningOffsetMs: number;
  nowLabel: string;
};

/** Viaggio nel tempo per provare gli arrivi senza aspettare la sera. Solo in sviluppo. */
export function DevTimePanel({ offsetMs, morningOffsetMs, nowLabel }: Props) {
  const [pending, startTransition] = useTransition();
  const moveTo = (ms: number) => startTransition(() => setDevOffsetAction(ms));

  return (
    <aside aria-label="Viaggio nel tempo" className="mt-8 space-y-2 rounded-xl border border-dashed p-3 text-sm">
      <p>
        Ora simulata: <span data-testid="dev-time">{nowLabel}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => moveTo(offsetMs + HOUR_MS)}>
          +1 ora
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => moveTo(offsetMs + 6 * HOUR_MS)}>
          +6 ore
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => moveTo(morningOffsetMs)}>
          Domani mattina
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => moveTo(0)}>
          Torna a ora
        </Button>
      </div>
    </aside>
  );
}
