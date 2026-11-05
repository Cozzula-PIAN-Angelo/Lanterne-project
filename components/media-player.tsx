"use client";

import { useState } from "react";
import { mediaUrlAction } from "@/app/(app)/actions/media";
import { Button } from "@/components/ui/button";

type Props = {
  lanternId: string;
  type: "audio" | "photo";
  /** Quel che fa il pulsante: "Ascolta", "Apri", "Riascolta". */
  action: string;
  /** Di cosa si tratta, per lo screen reader: "Vocale di Giulia, 3 minuti, delle 9:14". */
  label: string;
};

/** L'URL firmato si chiede solo al tocco, e dura 5 minuti: scaduto, se ne chiede un altro. */
export function MediaPlayer({ lanternId, type, action, label }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setPending(true);
    setError(null);
    try {
      const result = await mediaUrlAction({ lanternId });
      if ("error" in result) setError(result.error);
      else setUrl(result.url);
    } catch {
      setError("Non c'è rete: riprova tra poco.");
    }
    setPending(false);
  }

  const expired = () => {
    setUrl(null);
    setError("Il collegamento è scaduto: tocca di nuovo per riaprirlo.");
  };

  if (url && type === "audio") {
    return <audio controls src={url} onError={expired} className="w-full" aria-label={label} />;
  }
  if (url) {
    // L'URL firmato cambia a ogni apertura e non passa dall'ottimizzatore di immagini.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={label} onError={expired} className="w-full rounded-lg" />;
  }
  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" disabled={pending} onClick={open} aria-label={`${action}: ${label}`}>
        {action}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
