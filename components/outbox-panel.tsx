"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { flushOutbox, markForRetry, retryDelayMs, type OutboxItem } from "@/lib/client/outbox";
import { isHeldInMemory, OUTBOX_CHANGED, outboxStore } from "@/lib/client/outbox-store";
import { uploadMedia } from "@/lib/client/upload-media";

const KIND_LABEL = { audio: "Vocale", photo: "Foto" } as const;

export function OutboxPanel({ userId }: { userId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [sending, setSending] = useState(false);
  const [late, setLate] = useState(false);
  const running = useRef(false);
  const again = useRef(false);
  const attempts = useRef(0);

  const run = useCallback(async () => {
    // Un elemento aggiunto a giro iniziato non ne fa parte: serve un altro giro subito dopo.
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setSending(true);
    try {
      do {
        again.current = false;
        const before = await outboxStore.list(userId);
        setItems(before);
        const { sent } = await flushOutbox(outboxStore, userId, uploadMedia);
        if (sent.length > 0) setLate(sent.some((item) => item.late));
        // Anche quando ha inviato un'altra scheda: questa pagina deve mostrare la lanterna partita.
        const after = await outboxStore.list(userId);
        if (sent.length > 0 || after.length < before.length) {
          attempts.current = 0;
          router.refresh();
        }
      } while (again.current);
    } finally {
      running.current = false;
      setSending(false);
      setItems(await outboxStore.list(userId));
    }
  }, [router, userId]);

  useEffect(() => {
    const start = () => void run();
    const restart = () => {
      attempts.current = 0;
      start();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") restart();
    };
    start();
    window.addEventListener("online", restart);
    window.addEventListener(OUTBOX_CHANGED, start);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", restart);
      window.removeEventListener(OUTBOX_CHANGED, start);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [run]);

  // Con la rete accesa nessun evento dice che il server è di nuovo raggiungibile: si riprova a intervalli.
  useEffect(() => {
    if (sending || navigator.onLine === false || !items.some((item) => item.status === "waiting")) return;
    const timer = setTimeout(() => {
      attempts.current += 1;
      void run();
    }, retryDelayMs(attempts.current));
    return () => clearTimeout(timer);
  }, [items, sending, run]);

  async function retry(item: OutboxItem) {
    await markForRetry(outboxStore, userId, item.id);
    // Anche se un'altra scheda l'ha già inviato: il giro aggiorna l'elenco e la pagina.
    await run();
  }

  async function discard(item: OutboxItem) {
    await outboxStore.remove(item.id);
    setItems(await outboxStore.list(userId));
  }

  return (
    <>
      {late && (
        <p role="status" className="mb-4 text-sm">
          Era in attesa di rete: partirà la sera dopo.
        </p>
      )}
      {items.length > 0 && (
        <section
          aria-label="Lanterne non ancora partite"
          className="sticky top-0 z-10 mb-4 space-y-2 rounded-lg border bg-background p-3"
        >
          {items.some((item) => isHeldInMemory(item.id)) && (
            <p role="alert" className="text-sm text-destructive">
              Questo dispositivo non riesce a conservare i file: non chiudere la pagina finché non sono partiti.
            </p>
          )}
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="space-y-1">
                <p className="text-sm">
                  {KIND_LABEL[item.type]}
                  {item.status === "waiting" && (sending ? ": invio in corso…" : `: in attesa di rete`)}
                </p>
                {item.status === "rejected" && (
                  <p role="alert" className="text-sm text-destructive">
                    {item.message}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={sending} onClick={() => retry(item)}>
                    Riprova
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={sending} onClick={() => discard(item)}>
                    Scarta
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
